import { createRequire } from 'module'
import { lightningLogErrorHandler, lightningLogHandler } from './lightning-logs'
import { DEFAULT_MDK_NODE_OPTIONS } from './mdk-config'
import './undici-dispatcher'

process.env.RUST_LOG ??=
  'ldk_node=trace,lightning_background_processor=trace,vss_client=trace,reqwest=debug'

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

const RECEIVE_PAYMENTS_MIN_THRESHOLD_MS = 3000
const RECEIVE_PAYMENTS_QUIET_THRESHOLD_MS = 3000

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

    this.node = new MdkNode({
      network: options.nodeOptions?.network ?? DEFAULT_MDK_NODE_OPTIONS.network!,
      mdkApiKey: options.accessToken,
      vssUrl: options.nodeOptions?.vssUrl ?? DEFAULT_MDK_NODE_OPTIONS.vssUrl!,
      esploraUrl: options.nodeOptions?.esploraUrl ?? DEFAULT_MDK_NODE_OPTIONS.esploraUrl!,
      rgsUrl: options.nodeOptions?.rgsUrl ?? DEFAULT_MDK_NODE_OPTIONS.rgsUrl!,
      mnemonic: options.mnemonic,
      lspNodeId: options.nodeOptions?.lspNodeId ?? DEFAULT_MDK_NODE_OPTIONS.lspNodeId!,
      lspAddress: options.nodeOptions?.lspAddress ?? DEFAULT_MDK_NODE_OPTIONS.lspAddress!,
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

  payBolt12Offer(bolt12: string) {
    return this.node.payBolt12Offer(bolt12)
  }

  syncWallets() {
    return this.node.syncWallets()
  }

  getBalance() {
    return this.node.getBalance()
  }

  get invoices() {
    return {
      create: (amountSats: number | null) => {
        const expirySecs = 15 * 60
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
      createWithScid: (scid: string, amountSats: number | null) => {
        const expirySecs = 15 * 60
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
