import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { ContractRouterClient } from '@orpc/contract'

import { contract } from '@moneydevkit/api-contract'
import './undici-dispatcher'

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
      get: async (params: Parameters<typeof this.client.checkout.get>[0]) => {
        return await this.client.checkout.get(params)
      },
      create: async (
        fields: Omit<Parameters<typeof this.client.checkout.create>[0], 'nodeId'>,
        nodeId: string,
      ) => {
        return await this.client.checkout.create({
          ...fields,
          nodeId,
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
