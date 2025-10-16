import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { ContractRouterClient } from '@orpc/contract'
import { createRequire } from 'module'

import { contract } from '@moneydevkit/api-contract'

import { DEFAULT_LSP_NODE_ID } from '../constants'

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
  // Resolve the native binding at runtime to keep Next.js bundlers from trying to bundle it.
  if (!cachedLightningModule) {
    const runtimeRequire = getRuntimeRequire()

    cachedLightningModule = runtimeRequire('@moneydevkit/lightning-js') as LightningModule
  }

  return cachedLightningModule
}

const RECEIVE_PAYMENTS_MIN_THRESHOLD_MS = 3000
const RECEIVE_PAYMENTS_QUIET_THRESHOLD_MS = 3000

export interface MoneyDevKitOptions {
  accessToken: string
  mnemonic: string
  baseUrl?: string
  nodeOptions?: {
    network?: LightningNodeOptions['network']
    vssUrl?: LightningNodeOptions['vssUrl']
    esploraUrl?: LightningNodeOptions['esploraUrl']
    rgsUrl?: LightningNodeOptions['rgsUrl']
    lspNodeId?: LightningNodeOptions['lspNodeId']
    lspAddress?: LightningNodeOptions['lspAddress']
  }
}

export class MoneyDevKit {
  private client: ContractRouterClient<typeof contract>
  private node: LightningNodeInstance

  constructor(options: MoneyDevKitOptions) {
    const link = new RPCLink({
      url: options.baseUrl || 'http://localhost:3900/rpc',
      headers: () => ({
        'x-api-key': options.accessToken,
      }),
    })

    this.client = createORPCClient(link)

    const { MdkNode } = loadLightningModule()

    this.node = new MdkNode({
      network: options.nodeOptions?.network ?? "signet",
      mdkApiKey: options.accessToken,
      vssUrl: options.nodeOptions?.vssUrl ?? "https://vss.staging.moneydevkit.com/vss",
      esploraUrl:
        options.nodeOptions?.esploraUrl ?? "https://mutinynet.com/api",
      rgsUrl:
        options.nodeOptions?.rgsUrl ?? "https://rgs.mutinynet.com/snapshot",
      mnemonic: options.mnemonic,
      lspNodeId:
        options.nodeOptions?.lspNodeId ??
        DEFAULT_LSP_NODE_ID,
      lspAddress: options.nodeOptions?.lspAddress ?? "3.21.138.98:9735",
    });
  }

  getNodeId() {
    try {
      return this.node.getNodeId()
    } catch (error) {
      console.error('[MoneyDevKit] Failed to get node ID:', error)
      throw new Error(
        `Failed to get Lightning node ID: ${error instanceof Error ? error.message : 'ConnectionFailed'}. ` +
        'This may indicate the Lightning node failed to initialize properly. ' +
        'Please verify your MDK_MNEMONIC and MDK_ACCESS_TOKEN are correct.'
      )
    }
  }

  receivePayments() {
    try {
      return this.node.receivePayment(
        RECEIVE_PAYMENTS_MIN_THRESHOLD_MS,
        RECEIVE_PAYMENTS_QUIET_THRESHOLD_MS,
      )
    } catch (error) {
      console.error('[MoneyDevKit] Failed to receive payments:', error)
      // Return empty array instead of throwing to prevent webhook failures
      return []
    }
  }

  get invoices() {
    return {
      create: (amountSats: number | null) => {
        const expirySecs = 15 * 60
        const description = 'mdk invoice'

        try {
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
        } catch (error) {
          console.error('[MoneyDevKit] Failed to create invoice:', error)
          throw new Error(
            `Failed to create invoice: ${error instanceof Error ? error.message : 'ConnectionFailed'}. ` +
            'This may be due to network connectivity issues, incorrect configuration, or service unavailability. ' +
            'Please verify your MDK_MNEMONIC, MDK_ACCESS_TOKEN, and network settings.'
          )
        }
      },
      createWithScid: (scid: string, amountSats: number | null) => {
        const expirySecs = 15 * 60
        const description = 'mdk invoice'
        
        try {
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
        } catch (error) {
          console.error('[MoneyDevKit] Failed to create invoice with SCID:', error)
          throw new Error(
            `Failed to create invoice with SCID: ${error instanceof Error ? error.message : 'ConnectionFailed'}. ` +
            'This may be due to network connectivity issues, incorrect configuration, or service unavailability. ' +
            'Please verify your MDK_MNEMONIC, MDK_ACCESS_TOKEN, and network settings.'
          )
        }
      },
    }
  }

  get checkouts() {
    return {
      get: async (params: Parameters<typeof this.client.checkout.get>[0]) => {
        return await this.client.checkout.get(params)
      },
      create: async (
        fields: Omit<Parameters<typeof this.client.checkout.create>[0], 'nodeId'>,
      ) => {
        return await this.client.checkout.create({
          ...fields,
          nodeId: this.getNodeId(),
        })
      },
      confirm: async (params: Parameters<typeof this.client.checkout.confirm>[0]) => {
        return await this.client.checkout.confirm(params)
      },
      registerInvoice: async (
        params: Parameters<typeof this.client.checkout.registerInvoice>[0],
      ) => {
        return await this.client.checkout.registerInvoice(params)
      },
      paymentReceived: async (
        params: Parameters<typeof this.client.checkout.paymentReceived>[0],
      ) => {
        return await this.client.checkout.paymentReceived(params)
      },
    }
  }
}
