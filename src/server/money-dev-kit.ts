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

let cachedLightningModule: LightningModule | undefined

const ensureLightningModuleForTracing = () => {
  try {
    const runtimeRequire =
      typeof __non_webpack_require__ === 'function'
        ? __non_webpack_require__
        : typeof require !== 'undefined'
          ? require
          : createRequire(import.meta.url)

    runtimeRequire('@moneydevkit/lightning-js')
  } catch {
    // Ignore resolution errors here; the module will be required lazily below.
  }
}

ensureLightningModuleForTracing()

const loadLightningModule = (): LightningModule => {
  // Resolve the native binding at runtime to keep Next.js bundlers from trying to bundle it.
  if (!cachedLightningModule) {
    const runtimeRequire =
      typeof __non_webpack_require__ === 'function'
        ? __non_webpack_require__
        : typeof require !== 'undefined'
          ? require
          : createRequire(import.meta.url)

    cachedLightningModule = runtimeRequire('./lightning-entry.cjs') as LightningModule
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
      network: options.nodeOptions?.network ?? "regtest",
      mdkApiKey: options.accessToken,
      vssUrl: options.nodeOptions?.vssUrl ?? "http://localhost:9999/vss",
      esploraUrl:
        options.nodeOptions?.esploraUrl ?? "http://localhost:8080/regtest/api",
      rgsUrl:
        options.nodeOptions?.rgsUrl ?? "https://rgs.mutinynet.com/snapshot",
      mnemonic: options.mnemonic,
      lspNodeId:
        options.nodeOptions?.lspNodeId ??
        DEFAULT_LSP_NODE_ID,
      lspAddress: options.nodeOptions?.lspAddress ?? "localhost:9735",
    });
  }

  getNodeId() {
    return this.node.getNodeId()
  }

  receivePayments() {
    return this.node.receivePayment(
      RECEIVE_PAYMENTS_MIN_THRESHOLD_MS,
      RECEIVE_PAYMENTS_QUIET_THRESHOLD_MS,
    )
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
