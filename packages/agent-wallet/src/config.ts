import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import type { Network } from './mdk-config.js'

export interface WalletConfig {
  mnemonic: string
  network: Network
  walletId: string
}

export interface PartialConfig {
  mnemonic?: string
  network?: Network
  walletId?: string
}

const CONFIG_DIR = path.join(os.homedir(), '.mdk-wallet')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const PID_FILE = path.join(CONFIG_DIR, 'daemon.pid')
const PAYMENTS_FILE = path.join(CONFIG_DIR, 'payments.json')

export function getConfigDir(): string {
  return CONFIG_DIR
}

export function getConfigFile(): string {
  return CONFIG_FILE
}

export function getPidFile(): string {
  return PID_FILE
}

export function getPaymentsFile(): string {
  return PAYMENTS_FILE
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  }
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE)
}

export function loadConfig(): WalletConfig | null {
  if (!configExists()) {
    return null
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(data) as PartialConfig

    // Apply env overrides
    const mnemonic = process.env.MDK_WALLET_MNEMONIC ?? parsed.mnemonic
    const network = (process.env.MDK_WALLET_NETWORK as Network) ?? parsed.network ?? 'mainnet'
    const walletId = parsed.walletId

    if (!mnemonic || !walletId) {
      return null
    }

    return { mnemonic, network, walletId }
  } catch {
    return null
  }
}

export function saveConfig(config: WalletConfig): void {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function generateWalletId(): string {
  return crypto.randomUUID()
}

// Payment persistence
export interface StoredPayment {
  paymentHash: string
  amountSats: number
  direction: 'inbound' | 'outbound'
  timestamp: number
  destination?: string
  payerNote?: string
}

export function loadPayments(): StoredPayment[] {
  if (!fs.existsSync(PAYMENTS_FILE)) {
    return []
  }

  try {
    const data = fs.readFileSync(PAYMENTS_FILE, 'utf-8')
    return JSON.parse(data) as StoredPayment[]
  } catch {
    return []
  }
}

export function savePayment(payment: StoredPayment): void {
  ensureConfigDir()
  const payments = loadPayments()
  payments.push(payment)
  fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2), { mode: 0o600 })
}
