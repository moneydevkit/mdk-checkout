import { POST as corePOST, GET as coreGET } from '@moneydevkit/nextjs/server/route'
import { syncToGhost } from '../lib/ghost'

// Re-export GET unchanged
export { coreGET as GET }

// ============================================================================
// Types from api-contract/src/schemas
// ============================================================================

type RecurringInterval = 'MONTH' | 'QUARTER' | 'YEAR'

interface ProductPrice {
  id: string
  amountType: 'FIXED' | 'CUSTOM' | 'FREE' | 'METERED'
  priceAmount: number | null
  minimumAmount: number | null
  maximumAmount: number | null
  presetAmount: number | null
  unitAmount: number | null
  capAmount: number | null
  meterId: string | null
}

interface Product {
  id: string
  name: string
  description: string | null
  recurringInterval: RecurringInterval | null
  prices: ProductPrice[]
}

interface Customer {
  name?: string | null
  email?: string | null
  externalId?: string | null
  [key: string]: string | null | undefined
}

interface CheckoutUserMetadata {
  ghostTierId?: string
  months?: string
  [key: string]: string | undefined
}

interface PaymentReceivedCheckout {
  id: string
  status: 'PAYMENT_RECEIVED'
  type: 'PRODUCTS' | 'AMOUNT' | 'TOP_UP'
  products: Product[] | null
  customer: Customer | null
  userMetadata: CheckoutUserMetadata | null
  totalAmount: number
  netAmount: number
  invoiceAmountSats: number
}

interface CheckoutResponse {
  data: {
    status: string
    [key: string]: unknown
  }
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Convert recurring interval to months.
 * Defaults to 1 month if not specified.
 */
function intervalToMonths(interval: RecurringInterval | null | undefined): number {
  switch (interval) {
    case 'YEAR': return 12
    case 'QUARTER': return 3
    case 'MONTH':
    default: return 1
  }
}

/**
 * Type guard to check if checkout is in PAYMENT_RECEIVED status.
 */
function isPaymentReceived(data: unknown): data is PaymentReceivedCheckout {
  return (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    data.status === 'PAYMENT_RECEIVED'
  )
}

// ============================================================================
// Route handler
// ============================================================================

/**
 * POST handler that wraps core POST and syncs to Ghost on payment success.
 *
 * When a checkout status becomes PAYMENT_RECEIVED, this handler will:
 * 1. Look up or create a Ghost member using the checkout's customer email
 * 2. Find or create a Ghost tier matching the MDK product name
 * 3. Grant the tier to the member (or extend if already has it)
 *
 * Tier resolution (in order of priority):
 * 1. userMetadata.ghostTierId - explicit tier ID
 * 2. Product name from checkout - will find or create matching tier
 *
 * Required env vars:
 * - GHOST_URL: Your Ghost site URL (e.g., https://yourblog.ghost.io)
 * - GHOST_ADMIN_API_KEY: Ghost Admin API key (format: id:secret)
 */
export async function POST(request: Request): Promise<Response> {
  console.log('[ghost-route] POST handler called')
  const response = await corePOST(request)
  const cloned = response.clone()

  try {
    const result: CheckoutResponse = await cloned.json()
    console.log('[ghost-route] Response status:', result?.data?.status)
    console.log('[ghost-route] GHOST_URL configured:', !!process.env.GHOST_URL)
    console.log('[ghost-route] isPaymentReceived:', isPaymentReceived(result?.data))

    if (isPaymentReceived(result?.data) && process.env.GHOST_URL) {
      console.log('[ghost-route] Payment received, syncing to Ghost...')
      const checkout = result.data

      // Get product info for tier name, price, and interval
      const product = checkout.products?.[0]
      const tierName = product?.name
      const priceAmount = product?.prices?.[0]?.priceAmount ?? null
      const interval = product?.recurringInterval
      const months = intervalToMonths(interval)

      // Resolve months: explicit metadata override > product interval > default 1
      const resolvedMonths = checkout.userMetadata?.months
        ? parseInt(checkout.userMetadata.months, 10)
        : months

      console.log('[ghost-route] Sync params:', {
        email: checkout.customer?.email,
        name: checkout.customer?.name,
        externalId: checkout.customer?.externalId,
        ghostTierId: checkout.userMetadata?.ghostTierId,
        tierName,
        priceAmount,
        months: resolvedMonths,
      })

      const ghostResult = await syncToGhost({
        email: checkout.customer?.email,
        name: checkout.customer?.name,
        externalId: checkout.customer?.externalId,
        ghostTierId: checkout.userMetadata?.ghostTierId,
        tierName,
        priceAmount,
        months: resolvedMonths,
      })

      console.log('[ghost-route] Sync result:', ghostResult)

      return new Response(
        JSON.stringify({ ...result, ghost: ghostResult }),
        {
          status: response.status,
          headers: response.headers,
        }
      )
    }
  } catch (error) {
    console.error('[ghost-route] Error:', error)
    // If JSON parsing fails, just return original response
  }

  return response
}
