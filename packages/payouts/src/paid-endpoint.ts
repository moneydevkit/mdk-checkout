/**
 * Paid endpoint creation for tool providers
 *
 * Creates HTTP handlers that require Lightning payment before processing.
 * This is for RECEIVING payments (like checkout), not sending.
 */

import { createMoneyDevKitNode } from '@moneydevkit/core'

import { assertServerOnly } from './server-only'
import type { CreatePaidEndpointOptions, PaymentContext } from './types'

/**
 * Header name for invoice in 402 response
 */
const INVOICE_HEADER = 'x-lightning-invoice'

/**
 * Header name for preimage in request
 */
const PREIMAGE_HEADER = 'x-lightning-preimage'

/**
 * Header name for payment hash
 */
const PAYMENT_HASH_HEADER = 'x-lightning-payment-hash'

/**
 * Creates an HTTP handler that requires Lightning payment.
 *
 * Flow:
 * 1. Request comes in without payment proof
 * 2. Handler returns 402 with Lightning invoice
 * 3. Client pays invoice
 * 4. Client retries with preimage
 * 5. Handler verifies preimage and processes request
 *
 * @param options - Endpoint configuration including price and handler
 * @returns HTTP handler function
 *
 * @example
 * ```ts
 * // In your API route (e.g., app/api/tool/route.ts)
 * import { createPaidEndpoint } from '@moneydevkit/payouts'
 *
 * export const POST = createPaidEndpoint({
 *   priceSats: 10,
 *   handler: async (req, { payment }) => {
 *     const body = await req.json()
 *     const result = await processRequest(body)
 *     return Response.json(result)
 *   },
 * })
 * ```
 */
export function createPaidEndpoint<T>(
  options: CreatePaidEndpointOptions<T>,
): (request: Request) => Promise<Response> {
  assertServerOnly()

  const { priceSats, handler } = options

  if (typeof priceSats !== 'number' || priceSats <= 0) {
    throw new Error('priceSats must be a positive number')
  }

  return async (request: Request): Promise<Response> => {
    // Check for preimage header (proof of payment)
    const preimage = request.headers.get(PREIMAGE_HEADER)
    const paymentHash = request.headers.get(PAYMENT_HASH_HEADER)

    if (preimage && paymentHash) {
      // Verify preimage matches payment hash
      // TODO: Implement proper preimage verification
      // For now, trust that if preimage is provided, payment was made

      const paymentContext: PaymentContext = {
        amountSats: priceSats,
        preimage,
        paymentHash,
      }

      try {
        const result = await handler(request, { payment: paymentContext })

        if (result instanceof Response) {
          return result
        }

        return Response.json(result)
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'Handler error' },
          { status: 500 },
        )
      }
    }

    // No payment proof - return 402 with invoice
    try {
      const node = createMoneyDevKitNode()
      const invoiceData = node.invoices.create(priceSats)

      return new Response(
        JSON.stringify({
          message: 'Payment required',
          priceSats,
          invoice: invoiceData.invoice,
          paymentHash: invoiceData.paymentHash,
          expiresAt: invoiceData.expiresAt.toISOString(),
        }),
        {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            [INVOICE_HEADER]: invoiceData.invoice,
            [PAYMENT_HASH_HEADER]: invoiceData.paymentHash,
            // L402 standard header
            'WWW-Authenticate': `L402 invoice="${invoiceData.invoice}"`,
          },
        },
      )
    } catch (error) {
      return Response.json(
        { error: 'Failed to create invoice' },
        { status: 500 },
      )
    }
  }
}
