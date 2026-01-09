import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { ContractRouterClient } from '@orpc/contract'

import { contract, Checkout, CreateCheckout, ConfirmCheckout, RegisterInvoice, PaymentReceived, Product } from '@moneydevkit/api-contract'

export type MoneyDevKitClientOptions = {
  accessToken: string
  baseUrl: string
}

export class MoneyDevKitClient {
  private client: ContractRouterClient<typeof contract>

  constructor(options: MoneyDevKitClientOptions) {
    const link = new RPCLink({
      url: options.baseUrl,
      headers: () => ({
        'x-api-key': options.accessToken,
      }),
    })

    this.client = createORPCClient(link)
  }

  get checkouts() {
    return {
      get: async (params: { id: string }): Promise<Checkout> => {
        return await this.client.checkout.get(params)
      },
      create: async (
        fields: Omit<CreateCheckout, 'nodeId'>,
        nodeId: string,
      ): Promise<Checkout> => {
        return await this.client.checkout.create({
          ...fields,
          nodeId,
        })
      },
      confirm: async (params: ConfirmCheckout): Promise<Checkout> => {
        return await this.client.checkout.confirm(params)
      },
      registerInvoice: async (params: RegisterInvoice): Promise<Checkout> => {
        return await this.client.checkout.registerInvoice(params)
      },
      paymentReceived: async (params: PaymentReceived): Promise<{ ok: boolean }> => {
        return await this.client.checkout.paymentReceived(params)
      },
    }
  }

  get products() {
    return {
      list: async (): Promise<{ products: Product[] }> => {
        return await this.client.products.list({})
      },
    }
  }
}
