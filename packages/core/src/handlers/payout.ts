import { z } from 'zod'

import { log } from '../logging'
import { createMoneyDevKitNode } from '../mdk'
import { getPayoutConfig, PayoutAddressType } from '../payout-address'

const payoutSchema = z.object({
  amount: z.number().positive(),
})

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Unified payout handler that automatically detects the payout address type
 * from PAYOUT_ADDRESS env var and routes to the appropriate payment method.
 *
 * Supports: LNURL, Lightning Address, Bolt12 Offer, BIP-353
 *
 * Request body:
 * - amount: number (required) - amount in millisatoshis
 */
export async function handlePayout(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const parsed = payoutSchema.safeParse(body)

    if (!parsed.success) {
      return jsonResponse(400, {
        error: 'Invalid payout request',
        details: parsed.error.issues,
      })
    }

    const config = getPayoutConfig()

    if (!config.address) {
      return jsonResponse(500, {
        error: 'Payout address not configured. Set PAYOUT_ADDRESS environment variable.',
      })
    }

    const { address, type } = config.address
    const { amount } = parsed.data

    log(`Initiating payout flow with ${type} address`)

    const node = createMoneyDevKitNode()

    switch (type) {
      case 'bolt12':
        await node.payBolt12Offer(address, amount)
        break

      case 'lnurl':
      case 'lightning_address':
      case 'bip353':
        // LNURL, Lightning Address, and BIP-353 all use the same payment method
        await node.payLNUrl(address, amount)
        break

      case 'bolt11':
        // Bolt11 invoices are typically one-time use with a fixed amount
        // The amount parameter is ignored for bolt11
        await node.payBolt11(address)
        break

      default:
        return jsonResponse(500, {
          error: `Unsupported payout address type: ${type satisfies never}`,
        })
    }

    return jsonResponse(200, {
      success: true,
      type,
      amount,
    })
  } catch (error) {
    console.error('Payout error:', error)
    return jsonResponse(500, { error: 'Internal Server Error' })
  }
}
