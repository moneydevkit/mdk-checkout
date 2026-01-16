import { POST as corePOST, GET as coreGET } from '@moneydevkit/nextjs/server/route'
import { syncToGhost } from '../lib/ghost'

// Re-export GET unchanged
export { coreGET as GET }

/**
 * POST handler that wraps core POST and syncs to Ghost on payment success.
 *
 * When a checkout status becomes PAYMENT_RECEIVED, this handler will:
 * 1. Look up or create a Ghost member using the checkout's customer email
 * 2. Grant the tier specified in userMetadata.ghostTierId
 * 3. Extend the tier by userMetadata.months (default: 1)
 *
 * Required env vars:
 * - GHOST_URL: Your Ghost site URL (e.g., https://yourblog.ghost.io)
 * - GHOST_ADMIN_API_KEY: Ghost Admin API key (format: id:secret)
 */
export async function POST(request: Request): Promise<Response> {
  // Clone request since we need to read body twice potentially
  const response = await corePOST(request)

  // Clone response to read body
  const cloned = response.clone()

  try {
    const result = await cloned.json()

    // Check if this is a checkout response with PAYMENT_RECEIVED status
    if (result?.data?.status === 'PAYMENT_RECEIVED' && process.env.GHOST_URL) {
      const checkout = result.data

      const ghostResult = await syncToGhost({
        email: checkout.customer?.email,
        name: checkout.customer?.name,
        externalId: checkout.customer?.externalId,
        ghostTierId: checkout.userMetadata?.ghostTierId,
        months: parseInt(checkout.userMetadata?.months || '1', 10),
      })

      // Return augmented response with ghost sync result
      return new Response(
        JSON.stringify({ ...result, ghost: ghostResult }),
        {
          status: response.status,
          headers: response.headers,
        }
      )
    }
  } catch {
    // If JSON parsing fails, just return original response
  }

  return response
}
