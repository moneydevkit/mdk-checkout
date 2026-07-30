import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import type { Network } from './mdk-config.js'

export interface WalletConfig {
  mnemonic: string
  network: Network
  walletId: string
  /**
   * Signed LSPS4 fee claim granting this node the agent-wallet rate,
   * minted once by moneydevkit.com and cached here permanently. Absent
   * means the wallet pays the LSP's standard rate.
   */
  feeClaim?: string
  /**
   * The node_id the cached claim was minted for. Claims are node-bound, so
   * the cache is only valid while this matches the mnemonic-derived node
   * (MDK_WALLET_MNEMONIC can change the effective node under the same file).
   */
  feeClaimNodeId?: string
}

export interface PartialConfig {
  mnemonic?: string
  network?: Network
  walletId?: string
  feeClaim?: string
  feeClaimNodeId?: string
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
    const envClaim = process.env.MDK_WALLET_FEE_CLAIM
    const feeClaim = envClaim ?? parsed.feeClaim
    // The stored node binding describes the stored claim, not an env one.
    const feeClaimNodeId = envClaim ? undefined : parsed.feeClaimNodeId

    if (!mnemonic || !walletId) {
      return null
    }

    return { mnemonic, network, walletId, feeClaim, feeClaimNodeId }
  } catch {
    return null
  }
}

export function saveConfig(config: WalletConfig): void {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
}

/**
 * Persist a freshly minted fee claim by patching the raw config file rather
 * than re-serializing the loaded config, so env-var overrides (mnemonic,
 * network) never get baked into config.json as a side effect.
 */
export function saveFeeClaim(
  feeClaim: string,
  feeClaimNodeId: string,
  configFile: string = CONFIG_FILE,
): boolean {
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as PartialConfig
    parsed.feeClaim = feeClaim
    parsed.feeClaimNodeId = feeClaimNodeId
    fs.writeFileSync(configFile, JSON.stringify(parsed, null, 2), { mode: 0o600 })
    return true
  } catch (err) {
    console.error(`[fee-claim] failed to persist claim to ${configFile}: ${err}`)
    return false
  }
}

export function generateWalletId(): string {
  return crypto.randomUUID()
}

// Payment persistence — delegates to PaymentStore with the default file path.
import { PaymentStore } from './payment-store.js'
export { PaymentStore }
export type { StoredPayment, PaymentStatus } from './payment-store.js'
import type { StoredPayment } from './payment-store.js'

const defaultStore = new PaymentStore(PAYMENTS_FILE)

export function loadPayments(): StoredPayment[] {
  return defaultStore.load()
}

export function savePayment(payment: StoredPayment): void {
  defaultStore.save(payment)
}

export function updatePayment(
  ...args: Parameters<PaymentStore['update']>
): boolean {
  return defaultStore.update(...args)
}

export function findPayment(paymentId: string): StoredPayment | undefined {
  return defaultStore.find(paymentId)
}
