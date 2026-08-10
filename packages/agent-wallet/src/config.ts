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
const TOKEN_FILE = path.join(CONFIG_DIR, 'auth.token')

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

export function getTokenFile(): string {
  return TOKEN_FILE
}

/** Shape of a minted API token: 32 random bytes, lowercase hex. */
const TOKEN_PATTERN = /^[0-9a-f]{64}$/

/**
 * Read the stored API token, or null when the file is absent or does not hold a
 * token. Never returns a value it would not accept later: an empty or partial
 * file must not become a credential. Surrounding whitespace is tolerated so a
 * hand-managed file (which usually gains a trailing newline) still works.
 *
 * Throws when the path exists but is not a regular file, rather than reading
 * whatever it points at.
 */
function readApiToken(): string | null {
  let fd: number
  try {
    // O_NOFOLLOW plus fstat/fchmod/read on the open descriptor: every check and
    // the read itself apply to the same object, so the pathname cannot be
    // swapped for a symlink between the check and the use.
    fd = fs.openSync(TOKEN_FILE, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    if (code === 'ELOOP') throw new Error(`${TOKEN_FILE} is a symlink; remove it and retry`)
    throw err
  }

  try {
    const stat = fs.fstatSync(fd)
    if (!stat.isFile()) {
      throw new Error(`${TOKEN_FILE} is not a regular file; remove it and retry`)
    }

    // A loosened mode (umask, a restored backup, a copied home directory) must
    // not silently persist: whoever can read this file can spend the balance.
    if ((stat.mode & 0o077) !== 0) {
      fs.fchmodSync(fd, 0o600)
    }

    const token = fs.readFileSync(fd, 'utf-8').trim()
    return TOKEN_PATTERN.test(token) ? token : null
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Read the bearer token that guards the daemon's HTTP API, minting it on first
 * use. It lives in its own 0600 file rather than in config.json so publishing
 * it is one indivisible step: the CLI and the daemon it spawns race here, and a
 * read-modify-write of config.json would let one clobber the other's token and
 * lock itself out.
 *
 * Publication is write-to-temp then link(), not create-then-write. A plain
 * 'wx' create publishes the *name* atomically but not the contents, so a racing
 * reader could observe an empty file and go mint a second, conflicting token.
 * link() refuses to replace a token another process has already handed out.
 *
 * An existing file that is not a valid token is reported, never repaired. There
 * is nothing to gain from repairing it: a running daemon holds its token in
 * memory, so a freshly minted one would be rejected anyway, and "delete the bad
 * file" is racy in exactly the way link() exists to avoid.
 */
export function ensureApiToken(): string {
  ensureConfigDir()

  const existing = readApiToken()
  if (existing) return existing

  const temp = `${TOKEN_FILE}.${process.pid}.${crypto.randomBytes(6).toString('hex')}`
  try {
    // 'wx' on the temp too, so an EEXIST from this write is never mistaken for
    // the one below (which means another process published first).
    fs.writeFileSync(temp, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' })
    try {
      fs.linkSync(temp, TOKEN_FILE)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  } finally {
    try {
      fs.unlinkSync(temp)
    } catch {
      // Never let cleanup of a temp file mask the outcome, or leave a secret
      // behind if the write itself failed.
    }
  }

  const published = readApiToken()
  if (published) return published

  throw new Error(
    `${TOKEN_FILE} exists but holds no valid API token. Delete it, then run ` +
      '`agent-wallet restart` so the daemon and the CLI agree on a new one.',
  )
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
    return
  }

  // An existing directory carrying group or other bits lets someone else read
  // or swap what is inside it, and what is inside it is the mnemonic and the
  // API token. Clamp it rather than trusting how it got there.
  if ((fs.statSync(CONFIG_DIR).mode & 0o077) !== 0) {
    fs.chmodSync(CONFIG_DIR, 0o700)
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
