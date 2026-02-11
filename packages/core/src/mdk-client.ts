import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { ContractRouterClient } from '@orpc/contract'

import { contract, Checkout, CreateCheckout, ConfirmCheckout, RegisterInvoice, PaymentReceived, Product, Subscription, CustomerWithSubscriptions, GetCustomerInput } from '@moneydevkit/api-contract'

export type MoneyDevKitClientOptions = {
  accessToken: string
  baseUrl: string
}

/**
 * SDK-level checkout creation options.
 * Uses `product` (singular) for simplicity - multi-product support coming soon.
 */
export type CreateCheckoutOptions = Omit<CreateCheckout, 'nodeId' | 'products'> & {
  /**
   * Product ID to include in this checkout.
   * @example 'prod_123abc'
   */
  product?: string
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
        fields: CreateCheckoutOptions,
        nodeId: string,
      ): Promise<Checkout> => {
        const { product, ...rest } = fields
        return await this.client.checkout.create({
          ...rest,
          products: product ? [product] : undefined,
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

  get subscriptions() {
    return {
      get: async (params: { subscriptionId: string }): Promise<Subscription> => {
        return await this.client.subscription.get(params)
      },
      createRenewalCheckout: async (params: { subscriptionId: string }): Promise<{ checkoutId: string }> => {
        return await this.client.subscription.createRenewalCheckout(params)
      },
      cancel: async (params: { subscriptionId: string }): Promise<{ ok: boolean }> => {
        return await this.client.subscription.cancel(params)
      },
    }
  }

  get customers() {
    return {
      get: async (params: GetCustomerInput): Promise<CustomerWithSubscriptions> => {
        // Use getSdk which accepts GetCustomerInput and returns CustomerWithSubscriptions
        return await this.client.customer.getSdk(params)
      },
    }
  }
}
