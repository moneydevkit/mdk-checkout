import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'

// Re-export everything from core - users only need @moneydevkit/better-auth
export * from '@moneydevkit/core'
export { createUnifiedHandler, POST, GET } from '@moneydevkit/core/route'

import { createCheckout } from '@moneydevkit/core'
import type { CreateCheckoutParams } from '@moneydevkit/core'
import { CHECKOUT_ENDPOINT } from './constants'

export { CHECKOUT_ENDPOINT } from './constants'

/**
 * MoneyDevKit Better Auth Plugin
 *
 * Thin wrapper around @moneydevkit/core that automatically injects
 * authenticated user info into checkout customer data.
 * If no user is authenticated, creates checkout without customer info.
 */
export const moneydevkit = (): BetterAuthPlugin => {
  return {
    id: 'moneydevkit',
    endpoints: {
      createCheckout: createAuthEndpoint(
        CHECKOUT_ENDPOINT,
        {
          method: 'POST',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          try {
            // Better Auth already parses the body - access via ctx.body
            const body = ctx.body as CreateCheckoutParams

            const user = ctx.context.session?.user

            // If authenticated, inject user info into customer
            const customer = user
              ? {
                  ...body.customer,
                  externalId: user.id,
                  email: user.email ?? body.customer?.email,
                  name: user.name ?? body.customer?.name,
                }
              : body.customer

            const result = await createCheckout({
              ...body,
              customer,
            })

            if (result.error) {
              console.error('[MDK Better Auth] createCheckout error:', result.error)
              throw new Error(result.error.message)
            }

            const checkoutPath = body.checkoutPath || '/checkout'
            const redirectUrl = `${checkoutPath}/${result.data.checkout.id}`

            return ctx.json({
              checkout: result.data.checkout,
              redirectUrl,
            })
          } catch (err) {
            console.error('[MDK Better Auth] Checkout endpoint error:', err)
            throw err
          }
        },
      ),
    },
  }
}
