import { createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'

import { confirmCheckout, createCheckout, getCheckout } from '../actions'
import type { CreateCheckoutParams } from '../actions'
import { validateMetadata } from '@moneydevkit/api-contract'

/**
 * Customer data schema - matches api-contract but without complex transforms
 * to avoid TypeScript type instantiation issues.
 */
const customerInputSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  externalId: z.string().optional(),
}).catchall(z.string())

const commonCheckoutFields = {
  successUrl: z.string().optional(),
  checkoutPath: z.string().optional(),
  metadata: z.record(z.string()).optional()
    .superRefine((metadata, ctx) => {
      const validation = validateMetadata(metadata)
      if (!validation.ok) {
        for (const error of validation.error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error.message,
            path: ['metadata'],
          })
        }
      }
    }),
  customer: customerInputSchema.optional(),
  requireCustomerData: z.array(z.string()).optional(),
}

const amountCheckoutSchema = z.object({
  type: z.literal('AMOUNT'),
  currency: z.enum(['USD', 'SAT']),
  amount: z.number(),
  title: z.string().optional(),
  description: z.string().optional(),
  ...commonCheckoutFields,
})

const productCheckoutSchema = z.object({
  type: z.literal('PRODUCTS'),
  product: z.string(),
  ...commonCheckoutFields,
})

const createCheckoutSchema = z.discriminatedUnion('type', [
  amountCheckoutSchema,
  productCheckoutSchema,
])

const confirmCheckoutSchema = z.object({
  checkoutId: z.string(),
  customer: customerInputSchema.optional(),
  products: z.array(z.object({
    productId: z.string(),
    priceAmount: z.number().optional(),
  })).max(1).optional(),
})

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function handleCreateCheckout(request: Request): Promise<Response> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = z.object({ params: createCheckoutSchema }).safeParse(body)

  if (!parsed.success) {
    return jsonResponse(400, { error: 'Invalid checkout params', details: parsed.error.issues })
  }

  const result = await createCheckout(parsed.data.params)

  if (result.error) {
    const statusCode = result.error.code === 'webhook_unreachable' ? 400 : 500
    return jsonResponse(statusCode, { error: result.error.message, code: result.error.code })
  }

  return jsonResponse(200, { data: result.data.checkout })
}

export async function handleGetCheckout(request: Request): Promise<Response> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = z
    .object({ checkoutId: z.string().min(1) })
    .safeParse(body)

  if (!parsed.success) {
    return jsonResponse(400, { error: 'Missing checkoutId' })
  }

  try {
    const checkout = await getCheckout(parsed.data.checkoutId)
    return jsonResponse(200, { data: checkout })
  } catch (error) {
    console.error(error)
    return jsonResponse(500, { error: 'Failed to fetch checkout' })
  }
}

export async function handleConfirmCheckout(request: Request): Promise<Response> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = z
    .object({ confirm: confirmCheckoutSchema })
    .safeParse(body)

  if (!parsed.success) {
    return jsonResponse(400, { error: 'Invalid confirm payload', details: parsed.error.issues })
  }

  try {
    const checkout = await confirmCheckout(parsed.data.confirm)
    return jsonResponse(200, { data: checkout })
  } catch (error) {
    console.error(error)
    return jsonResponse(500, { error: 'Failed to confirm checkout' })
  }
}

// ============================================================================
// URL-based Checkout Creation Helpers
// ============================================================================

export interface CreateCheckoutUrlOptions {
  basePath?: string
}

/**
 * Generate a signed checkout URL for URL-based checkout creation.
 * All params are HMAC-signed using MDK_ACCESS_TOKEN to prevent tampering.
 *
 * @example
 * const url = createCheckoutUrl({
 *   title: 'Product',
 *   description: 'Payment for product',
 *   amount: 2999,
 *   currency: 'USD',
 * })
 * // Returns: /api/mdk?action=createCheckout&amount=2999&...&signature=abc123
 */
export function createCheckoutUrl(
  params: CreateCheckoutParams,
  options?: CreateCheckoutUrlOptions
): string {
  const basePath = options?.basePath ?? '/api/mdk'
  const accessToken = process.env.MDK_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('MDK_ACCESS_TOKEN is required for creating checkout URLs')
  }

  // Build URL params
  const urlParams = new URLSearchParams()
  urlParams.set('action', 'createCheckout')

  // Add all params, JSON-stringify objects
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (typeof value === 'object' && value !== null) {
      urlParams.set(key, JSON.stringify(value))
    } else {
      urlParams.set(key, String(value))
    }
  }

  // Sort params alphabetically for consistent signature
  urlParams.sort()
  const canonicalString = urlParams.toString()

  // Compute HMAC-SHA256 signature
  const signature = createHmac('sha256', accessToken)
    .update(canonicalString)
    .digest('hex')

  urlParams.set('signature', signature)

  return `${basePath}?${urlParams.toString()}`
}

/**
 * Verify the HMAC signature of checkout URL params.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyCheckoutSignature(
  params: URLSearchParams,
  signature: string
): boolean {
  const accessToken = process.env.MDK_ACCESS_TOKEN
  if (!accessToken) return false

  // Clone params and remove signature for verification
  const paramsToVerify = new URLSearchParams(params)
  paramsToVerify.delete('signature')
  paramsToVerify.sort()

  const canonicalString = paramsToVerify.toString()
  const expectedSignature = createHmac('sha256', accessToken)
    .update(canonicalString)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks
  try {
    const sigBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')

    if (sigBuffer.length !== expectedBuffer.length) {
      return false
    }

    return timingSafeEqual(sigBuffer, expectedBuffer)
  } catch {
    return false
  }
}

/**
 * Parse URL query params into checkout params.
 * Handles JSON parsing for nested objects (metadata, customer, requireCustomerData).
 */
export function parseCheckoutQueryParams(params: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {}

  for (const [key, value] of params) {
    // Skip action and signature - they're not checkout params
    if (key === 'action' || key === 'signature') continue

    // JSON parse for objects/arrays
    if (key === 'metadata' || key === 'customer' || key === 'requireCustomerData' || key === 'products') {
      try {
        raw[key] = JSON.parse(value)
      } catch {
        // If JSON parsing fails, keep as string
        raw[key] = value
      }
    } else if (key === 'amount') {
      // Parse amount as number
      raw[key] = Number(value)
    } else {
      raw[key] = value
    }
  }

  return raw
}

/**
 * Validates and sanitizes checkoutPath to prevent open redirect attacks.
 * Returns a safe relative path or the default '/checkout'.
 *
 * Security considerations:
 * - Must start with / (relative path)
 * - Must not contain :// or // (prevents protocol-relative URLs and absolute URLs)
 */
export function sanitizeCheckoutPath(checkoutPath: string | null): string {
  const defaultPath = '/checkout'

  if (!checkoutPath) {
    return defaultPath
  }

  // Must start with / (relative path)
  if (!checkoutPath.startsWith('/')) {
    return defaultPath
  }

  // Must not contain :// or // (prevents protocol-relative URLs and absolute URLs)
  if (checkoutPath.includes('://') || checkoutPath.includes('//')) {
    return defaultPath
  }

  // Strip query string and hash - they would break URL construction when appending /{id}
  // e.g., /checkout?foo=bar + /abc123 would become /checkout?foo=bar/abc123 (broken)
  const queryIndex = checkoutPath.indexOf('?')
  const hashIndex = checkoutPath.indexOf('#')

  let endIndex = checkoutPath.length
  if (queryIndex !== -1) endIndex = Math.min(endIndex, queryIndex)
  if (hashIndex !== -1) endIndex = Math.min(endIndex, hashIndex)

  return checkoutPath.slice(0, endIndex)
}

/**
 * Create a checkout from parsed query params.
 * Validates against the same schema as handleCreateCheckout.
 */
export async function handleCreateCheckoutFromUrl(
  params: Record<string, unknown>
): Promise<{ error: { code: string; message: string } } | { data: { id: string; checkoutPath: string } }> {
  // Infer type if not provided - the schema requires it for discriminated union
  if (!params.type) {
    params.type = params.products ? 'PRODUCTS' : 'AMOUNT'
  }

  const parsed = createCheckoutSchema.safeParse(params)

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]
    return {
      error: {
        code: 'validation_error',
        message: firstError?.message ?? 'Invalid checkout parameters',
      },
    }
  }

  const result = await createCheckout(parsed.data)

  if (result.error) {
    return {
      error: {
        code: result.error.code,
        message: result.error.message,
      },
    }
  }

  return {
    data: {
      id: result.data.checkout.id,
      checkoutPath: parsed.data.checkoutPath ?? '/checkout',
    },
  }
}
