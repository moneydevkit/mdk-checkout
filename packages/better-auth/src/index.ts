import { z } from 'zod'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { createCheckout, getCheckout } from '@moneydevkit/core'
import { createUnifiedHandler, POST } from '@moneydevkit/core/route'
import type { BetterAuthPlugin } from 'better-auth'
import type { CheckoutUserInfo } from './types'

// Re-export core functions for use as a separate route if needed
export { createUnifiedHandler, POST }
export { createCheckout, getCheckout }

/**
 * MoneyDevKit Better Auth Plugin
 *
 * Integrates MoneyDevKit checkout with Better Auth for seamless
 * payment experiences with authenticated users. User info (email, name, id)
 * is automatically attached to all checkouts.
 *
 * @example
 * ```typescript
 * import { betterAuth } from "better-auth"
 * import { moneydevkit } from "@moneydevkit/better-auth"
 *
 * const auth = betterAuth({
 *   plugins: [moneydevkit()]
 * })
 * ```
 */
export const moneydevkit = (): BetterAuthPlugin => {

  return {
    id: 'moneydevkit',
    endpoints: {
      /**
       * Create a new checkout session
       * Requires authenticated user session
       */
      createCheckout: createAuthEndpoint(
        '/moneydevkit/checkout',
        {
          method: 'POST',
          body: z.object({
            title: z.string().min(1, 'Title is required'),
            description: z.string().min(1, 'Description is required'),
            amount: z.number().positive('Amount must be positive'),
            currency: z.enum(['USD', 'SAT']).optional().default('USD'),
            successUrl: z.string().optional(),
            checkoutPath: z.string().optional(),
            metadata: z.record(z.unknown()).optional(),
          }),
          use: [sessionMiddleware],
          metadata: {
            openapi: {
              description: 'Create a new MoneyDevKit checkout session',
              responses: {
                200: {
                  description: 'Checkout created successfully',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          checkout: { type: 'object' },
                          redirectUrl: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          const { body } = ctx
          const session = ctx.context.session
          const user = session?.user

          if (!user) {
            throw new Error('User not found in session')
          }

          // Build user info for checkout metadata (always included)
          const userInfo: CheckoutUserInfo = {
            userId: user.id,
            userEmail: user.email,
            userName: user.name,
          }

          // Create checkout using the core function
          // This handles all the logic including invoice registration
          const checkout = await createCheckout({
            title: body.title,
            description: body.description,
            amount: body.amount,
            currency: body.currency,
            successUrl: body.successUrl,
            metadata: {
              ...body.metadata,
              userInfo,
            },
          })

          const checkoutPath = body.checkoutPath || '/checkout'
          const redirectUrl = `${checkoutPath}/${checkout.id}`

          return ctx.json({
            checkout,
            redirectUrl,
          })
        },
      ),

      /**
       * Get checkout status by ID
       * Requires authenticated user session
       */
      getCheckout: createAuthEndpoint(
        '/moneydevkit/checkout/:id',
        {
          method: 'GET',
          use: [sessionMiddleware],
          metadata: {
            openapi: {
              description: 'Get checkout status by ID',
              responses: {
                200: {
                  description: 'Checkout details',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          checkout: { type: 'object' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          const checkoutId = ctx.params?.id
          if (!checkoutId) {
            throw new Error('Checkout ID is required')
          }

          // Use core getCheckout function
          const checkout = await getCheckout(checkoutId)
          return ctx.json({ checkout })
        },
      ),

      /**
       * Unified handler for all core MDK routes
       * Routes: webhook, webhooks, balance, ping, pay_bolt_12, pay_bolt11, pay_ln_url, list_channels
       * Authentication: Uses MDK_ACCESS_TOKEN header (x-moneydevkit-webhook-secret)
       */
      handler: createAuthEndpoint(
        '/moneydevkit/handler',
        {
          method: 'POST',
          body: z.object({
            handler: z.string(),
            params: z.record(z.unknown()).optional(),
          }).passthrough(),
          metadata: {
            openapi: {
              description: 'Unified handler for all MoneyDevKit routes (webhooks, balance, payments, etc.)',
              responses: {
                200: {
                  description: 'Route response',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          // Forward the request to the core unified handler
          const unifiedHandler = createUnifiedHandler()

          // Build the request for the core handler
          const headers = new Headers()
          const authHeader = ctx.request?.headers.get('x-moneydevkit-webhook-secret')
          if (authHeader) {
            headers.set('x-moneydevkit-webhook-secret', authHeader)
          }
          headers.set('content-type', 'application/json')

          const request = new Request('http://localhost/api/mdk', {
            method: 'POST',
            headers,
            body: JSON.stringify(ctx.body),
          })

          const response = await unifiedHandler(request)
          const data = await response.json()

          return ctx.json(data, { status: response.status })
        },
      ),
    },
  }
}

export type { CheckoutParams, CheckoutUserInfo, Checkout } from './types'
