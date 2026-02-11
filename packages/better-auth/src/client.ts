import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { CreateCheckoutParams } from '@moneydevkit/core'
import { CHECKOUT_ENDPOINT } from './constants'

/**
 * MoneyDevKit Client Plugin for Better Auth
 *
 * Provides `createCheckout` - same API as `useCheckout().createCheckout` from @moneydevkit/nextjs
 */
export const moneydevkitClient = () => {
  return {
    id: 'moneydevkit',
    getActions: ($fetch) => ({
      /**
       * Create a checkout and return the URL.
       * Same API as useCheckout().createCheckout from @moneydevkit/nextjs
       */
      createCheckout: async (params: CreateCheckoutParams) => {
        const response = await $fetch<{ redirectUrl: string }>(
          CHECKOUT_ENDPOINT,
          { method: 'POST', body: params },
        )

        if (response.error || !response.data) {
          return { data: null, error: response.error }
        }

        return { data: { checkoutUrl: response.data.redirectUrl }, error: null }
      },
    }),
  } satisfies BetterAuthClientPlugin
}
