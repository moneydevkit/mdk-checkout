import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { ContractRouterClient } from '@orpc/contract'
import { contract } from '@moneydevkit/api-contract'
import { MdkNode } from '@moneydevkit/lightning-js'

const RECEIVE_PAYMENTS_MIN_THRESHOLD_MS = 3000
const RECEIVE_PAYMENTS_QUIET_THRESHOLD_MS = 3000

export interface MoneyDevKitOptions {
  accessToken: string
  mnemonic: string
  baseUrl?: string
  nodeOptions?: {
    network?: ConstructorParameters<typeof MdkNode>[0]['network']
    vssUrl?: string
    esploraUrl?: string
    rgsUrl?: string
    lspNodeId?: string
    lspAddress?: string
  }
}

export class MoneyDevKit {
  private client: ContractRouterClient<typeof contract>
  private node: MdkNode

  constructor(options: MoneyDevKitOptions) {
    const link = new RPCLink({
      url: options.baseUrl || 'http://localhost:3900/rpc',
      headers: () => ({
        'x-api-key': options.accessToken,
      }),
    })

    this.client = createORPCClient(link)

    this.node = new MdkNode({
      network: options.nodeOptions?.network ?? 'signet',
      mdkApiKey: options.accessToken,
      vssUrl: options.nodeOptions?.vssUrl ?? 'http://localhost:9999/vss',
      esploraUrl: options.nodeOptions?.esploraUrl ?? 'https://mutinynet.com/api',
      rgsUrl: options.nodeOptions?.rgsUrl ?? 'https://rgs.mutinynet.com/snapshot',
      mnemonic: options.mnemonic,
      lspNodeId:
        options.nodeOptions?.lspNodeId ??
        '02b0c0afa258b50a2b82c0eaca70e869d7d723e28ab94d276532b776f704e22c60',
      lspAddress: options.nodeOptions?.lspAddress ?? 'localhost:9735',
    })
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
