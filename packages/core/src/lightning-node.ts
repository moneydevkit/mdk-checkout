import { PaymentEvent, PaymentResult } from '@moneydevkit/lightning-js'
import { createRequire } from 'module'
import { lightningLogErrorHandler, lightningLogHandler } from './lightning-logs'
import { MAINNET_MDK_NODE_OPTIONS, SIGNET_MDK_NODE_OPTIONS } from './mdk-config'

process.env.RUST_LOG ??=
  'ldk_node=trace,lightning_background_processor=trace,vss_client=trace,reqwest=debug,lightning_rapid_gossip_sync=debug'

type LightningModule = typeof import('@moneydevkit/lightning-js')
type LightningNodeConstructor = LightningModule['MdkNode']
type LightningNodeInstance = InstanceType<LightningNodeConstructor>
type LightningNodeOptions = ConstructorParameters<LightningNodeConstructor>[0]

declare const __non_webpack_require__: NodeRequire | undefined

const OPTIONAL_LIGHTNING_PACKAGES = [
  '@moneydevkit/lightning-js-linux-x64-gnu',
  '@moneydevkit/lightning-js-linux-x64-musl',
  '@moneydevkit/lightning-js-linux-arm64-gnu',
  '@moneydevkit/lightning-js-linux-arm64-musl',
  '@moneydevkit/lightning-js-linux-arm-gnueabihf',
  '@moneydevkit/lightning-js-android-arm64',
  '@moneydevkit/lightning-js-android-arm-eabi',
  '@moneydevkit/lightning-js-win32-x64-msvc',
  '@moneydevkit/lightning-js-win32-ia32-msvc',
  '@moneydevkit/lightning-js-win32-arm64-msvc',
  '@moneydevkit/lightning-js-darwin-x64',
  '@moneydevkit/lightning-js-darwin-arm64',
  '@moneydevkit/lightning-js-freebsd-x64',
]

let cachedLightningModule: LightningModule | undefined

const getRuntimeRequire = () => {
  if (typeof __non_webpack_require__ === 'function') {
    return __non_webpack_require__
  }

  try {
    return createRequire(import.meta.url)
  } catch (error) {
    if (typeof require === 'function') {
      return require
    }

    throw error
  }
}

const ensureLightningPackagesForTracing = () => {
  const runtimeRequire = getRuntimeRequire()
  const specifiers = ['@moneydevkit/lightning-js', ...OPTIONAL_LIGHTNING_PACKAGES]

  for (const specifier of specifiers) {
    try {
      if (typeof runtimeRequire.resolve === 'function') {
        runtimeRequire.resolve(specifier)
      }
    } catch {
      // Ignore resolution errors; only needed to hint bundlers about the dependency graph.
    }
  }
}

ensureLightningPackagesForTracing()

const loadLightningModule = (): LightningModule => {
  if (!cachedLightningModule) {
    const runtimeRequire = getRuntimeRequire()
    cachedLightningModule = runtimeRequire('@moneydevkit/lightning-js') as LightningModule
  }

  return cachedLightningModule
}

export function deriveNodeId(mnemonic: string, network: string): string {
  const { deriveNodeId: rustDeriveNodeId } = loadLightningModule()
  return rustDeriveNodeId(mnemonic, network)
}

export interface MoneyDevKitNodeOptions {
  accessToken: string
  mnemonic: string
  nodeOptions?: {
    network?: LightningNodeOptions['network']
    vssUrl?: LightningNodeOptions['vssUrl']
    esploraUrl?: LightningNodeOptions['esploraUrl']
    rgsUrl?: LightningNodeOptions['rgsUrl']
    lspNodeId?: LightningNodeOptions['lspNodeId']
    lspAddress?: LightningNodeOptions['lspAddress']
  }
}

const RECEIVE_PAYMENTS_MIN_THRESHOLD_MS = 6000
const RECEIVE_PAYMENTS_QUIET_THRESHOLD_MS = 4000

export class MoneyDevKitNode {
  private node: LightningNodeInstance

  constructor(options: MoneyDevKitNodeOptions) {
    const { MdkNode, setLogListener } = loadLightningModule()
      ; (setLogListener as any)((err: unknown, entry: unknown) => {
        if (err) {
          lightningLogErrorHandler(err)
          return
        }

        lightningLogHandler(entry)
      }, 'TRACE')

    const network = options.nodeOptions?.network ?? MAINNET_MDK_NODE_OPTIONS.network!
    const defaultNodeOptions = network === 'signet' ? SIGNET_MDK_NODE_OPTIONS : MAINNET_MDK_NODE_OPTIONS

    this.node = new MdkNode({
      network,
      mdkApiKey: options.accessToken,
      vssUrl: options.nodeOptions?.vssUrl ?? defaultNodeOptions.vssUrl!,
      esploraUrl: options.nodeOptions?.esploraUrl ?? defaultNodeOptions.esploraUrl!,
      rgsUrl: options.nodeOptions?.rgsUrl ?? defaultNodeOptions.rgsUrl!,
      mnemonic: options.mnemonic,
      lspNodeId: options.nodeOptions?.lspNodeId ?? defaultNodeOptions.lspNodeId!,
      lspAddress: options.nodeOptions?.lspAddress ?? defaultNodeOptions.lspAddress!,
    })
  }

  get id() {
    return this.node.getNodeId()
  }

  receivePayments() {
    return this.node.receivePayment(
      RECEIVE_PAYMENTS_MIN_THRESHOLD_MS,
      RECEIVE_PAYMENTS_QUIET_THRESHOLD_MS,
    )
  }

  /** Start the node and sync wallets. The node must be started before polling for events. */
  startReceiving(): void {
    this.node.startReceiving()
  }

  /**
   * Get the next payment event without ACKing it.
   * Returns null if no events are available.
   * Must call ackEvent() after successfully handling the event.
   */
  nextEvent(): PaymentEvent | null {
    return this.node.nextEvent()
  }

  /**
   * ACK the current event after successfully handling it.
   * Must be called after nextEvent() returns an event, before calling nextEvent() again.
   */
  ackEvent(): void {
    this.node.ackEvent()
  }

  /** Stop the node. Call when done polling. */
  stopReceiving(): void {
    this.node.stopReceiving()
  }

  pay(destination: string, amountMsat?: number): PaymentResult {
    return this.node.pay(destination, amountMsat ?? null, 30)
  }

  /**
   * Fire-and-forget payment for use during a running session (after startReceiving).
   *
   * Wraps node.payWhileRunning(_, _, 0): returns immediately with paymentId; the
   * Sent or Failed event arrives later via nextEvent() and is forwarded to mdk.com
   * over the WS event stream.
   *
   * Takes amountMsat directly (NO sat→msat conversion). Do NOT mix with this.pay()
   * or this.invoices.create() in the same call site - those take sats.
   */
  payNow(destination: string, amountMsat: number | null): PaymentResult {
    return this.node.payWhileRunning(destination, amountMsat, 0)
  }

  /**
   * Register LSPS4 + sync gossip so the node can accept payments for existing
   * BOLT12 offers on this session. Idempotent. Required at startup if BOLT12
   * receive is in scope. See lightning-js/index.d.ts:147 and the agent-wallet
   * pattern at agent-wallet/src/server.ts:159.
   */
  setupBolt12Receive(): void {
    this.node.setupBolt12Receive()
  }

  /**
   * Mint a BOLT11 invoice while the node is running. amountMsat null requests a
   * variable-amount JIT invoice. Takes msats directly.
   */
  createInvoiceNow(
    amountMsat: number | null,
    description: string,
    expirySecs: number,
  ): { bolt11: string; paymentHash: string; expiresAt: number; scid: string } {
    const invoice =
      amountMsat === null
        ? this.node.getVariableAmountJitInvoiceWhileRunning(description, expirySecs)
        : this.node.getInvoiceWhileRunning(amountMsat, description, expirySecs)
    return {
      bolt11: invoice.bolt11,
      paymentHash: invoice.paymentHash,
      expiresAt: invoice.expiresAt,
      scid: invoice.scid,
    }
  }

  /**
   * Mint a BOLT12 offer while the node is running. amountMsat null requests a
   * variable-amount offer. Takes msats directly.
   */
  createBolt12OfferNow(
    amountMsat: number | null,
    description: string,
    expirySecs: number | undefined,
  ): string {
    return amountMsat === null
      ? this.node.getVariableAmountBolt12OfferWhileRunning(description, expirySecs)
      : this.node.getBolt12OfferWhileRunning(amountMsat, description, expirySecs)
  }

  listChannels() {
    return this.node.listChannels()
  }

  syncWallets() {
    return this.node.syncWallets()
  }

  /** Tear down the node and free resources. */
  destroy() {
    this.node.destroy()
  }

  syncRgs(doFullSync: boolean) {
    return this.node.syncRgs(doFullSync)
  }

  getBalance() {
    return this.node.getBalance()
  }

  get invoices() {
    return {
      create: (amountSats: number | null, customExpirySecs?: number) => {
        const expirySecs = customExpirySecs ?? 15 * 60
        const description = 'mdk invoice'

        const invoice =
          amountSats === null
            ? this.node.getVariableAmountJitInvoice(description, expirySecs)
            : this.node.getInvoice(amountSats * 1000, description, expirySecs)

        return {
          invoice: invoice.bolt11,
          paymentHash: invoice.paymentHash,
          scid: invoice.scid,
          expiresAt: new Date(invoice.expiresAt * 1000),
        }
      },
      createWithScid: (scid: string, amountSats: number | null, customExpirySecs?: number) => {
        const expirySecs = customExpirySecs ?? 15 * 60
        const description = 'mdk invoice'
        const invoice =
          amountSats === null
            ? this.node.getVariableAmountJitInvoiceWithScid(scid, description, expirySecs)
            : this.node.getInvoiceWithScid(scid, amountSats * 1000, description, expirySecs)

        return {
          invoice: invoice.bolt11,
          paymentHash: invoice.paymentHash,
          scid: invoice.scid,
          expiresAt: new Date(invoice.expiresAt * 1000),
        }
      },
    }
  }
}
