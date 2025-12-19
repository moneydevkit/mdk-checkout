import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { moneydevkit } from './index'
import type { CheckoutParams } from './types'

/**
 * MoneyDevKit Client Plugin for Better Auth
 *
 * Provides client-side methods for creating checkouts with
 * automatic session handling.
 *
 * @example
 * ```typescript
 * import { createAuthClient } from "better-auth/react"
 * import { moneydevkitClient } from "@moneydevkit/better-auth/client"
 *
 * const authClient = createAuthClient({
 *   plugins: [moneydevkitClient()]
 * })
 *
 * // Create a checkout (auto-redirects to checkout page)
 * await authClient.checkout({
 *   title: "Premium Plan",
 *   description: "Monthly subscription",
 *   amount: 500,
 *   currency: "USD",
 *   successUrl: "/checkout/success"
 * })
 * ```
 */
export const moneydevkitClient = () => {
  return {
    id: 'moneydevkit',
    $InferServerPlugin: {} as ReturnType<typeof moneydevkit>,
    pathMethods: {
      '/moneydevkit/checkout': 'POST',
      '/moneydevkit/checkout/:id': 'GET',
    },
    getActions: ($fetch) => ({
      /**
       * Create a checkout and optionally redirect to the checkout page
       *
       * @param params - Checkout parameters
       * @param options - Additional options
       * @returns The created checkout and redirect URL
       */
      checkout: async (
        params: CheckoutParams,
        options?: {
          /** Set to false to prevent automatic redirect */
          redirect?: boolean
        },
      ) => {
        const response = await $fetch<{
          checkout: {
            id: string
            status: string
            currency: string
            totalAmount?: number
            invoiceAmountSats?: number
          }
          redirectUrl: string
        }>('/moneydevkit/checkout', {
          method: 'POST',
          body: params,
        })

        // Auto-redirect unless explicitly disabled
        const shouldRedirect = options?.redirect !== false
        if (shouldRedirect && response.data?.redirectUrl && typeof window !== 'undefined') {
          window.location.href = response.data.redirectUrl
        }

        return response
      },

      /**
       * Get checkout status by ID
       *
       * @param id - The checkout ID
       * @returns The checkout details
       */
      getCheckout: async (id: string) => {
        return $fetch<{
          checkout: {
            id: string
            status: string
            currency: string
            totalAmount?: number
            invoiceAmountSats?: number
            invoice?: {
              invoice: string
              paymentHash: string
              amountSats?: number
              expiresAt?: string
            }
          }
        }>(`/moneydevkit/checkout/${id}`, {
          method: 'GET',
        })
      },
    }),
  } satisfies BetterAuthClientPlugin
}

export type { CheckoutParams }
