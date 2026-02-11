import { createHmac, timingSafeEqual } from 'crypto'

import { createMoneyDevKitClient, createMoneyDevKitNode } from '../mdk'
import { sanitizeCheckoutPath } from './checkout'

/**
 * The base URL for MoneyDevKit hosted pages.
 * In production this is https://www.moneydevkit.com
 * Can be overridden via MDK_HOST environment variable for development.
 */
const MDK_HOST = process.env.MDK_HOST ?? 'https://www.moneydevkit.com'

/**
 * Options for creating a subscription renewal URL.
 */
export interface CreateRenewalSubscriptionUrlOptions {
  /** The subscription ID to renew */
  subscriptionId: string
  /** Base path for the MDK API (default: /api/mdk) */
  basePath?: string
  /** Custom checkout path (default: /checkout) */
  checkoutPath?: string
}

/**
 * Options for creating a subscription cancel URL.
 */
export interface CreateCancelSubscriptionUrlOptions {
  /** The subscription ID to cancel */
  subscriptionId: string
}

// ────────────────────────────────────────────────────────────────────────────────
// Core signature utilities - parameterized versions for use by backend or SDK
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Generate an HMAC-SHA256 signature for subscription action URL params.
 * This is the core signing function used by both SDK helpers and backend services.
 *
 * @param action - The action type ('cancelSubscription' or 'renewSubscription')
 * @param subscriptionId - The subscription ID
 * @param secret - The HMAC secret (MDK_ACCESS_TOKEN / app.apiKey)
 * @param additionalParams - Optional additional params to include (e.g., checkoutPath)
 * @returns The hex-encoded HMAC signature
 *
 * @example
 * // Backend usage with app.apiKey from database
 * const signature = generateSubscriptionSignature(
 *   'cancelSubscription',
 *   subscriptionId,
 *   app.apiKey
 * )
 *
 * @example
 * // SDK usage with MDK_ACCESS_TOKEN from env
 * const signature = generateSubscriptionSignature(
 *   'renewSubscription',
 *   subscriptionId,
 *   process.env.MDK_ACCESS_TOKEN!,
 *   { checkoutPath: '/checkout' }
 * )
 */
export function generateSubscriptionSignature(
  action: 'cancelSubscription' | 'renewSubscription',
  subscriptionId: string,
  secret: string,
  additionalParams?: Record<string, string>
): string {
  const urlParams = new URLSearchParams()
  urlParams.set('action', action)
  urlParams.set('subscriptionId', subscriptionId)

  if (additionalParams) {
    for (const [key, value] of Object.entries(additionalParams)) {
      urlParams.set(key, value)
    }
  }

  urlParams.sort()
  const canonicalString = urlParams.toString()

  return createHmac('sha256', secret)
    .update(canonicalString)
    .digest('hex')
}

/**
 * Verify an HMAC-SHA256 signature for subscription action URL params.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param params - The URL params (action, subscriptionId, optionally checkoutPath)
 * @param signature - The signature to verify
 * @param secret - The HMAC secret (MDK_ACCESS_TOKEN / app.apiKey)
 * @returns True if signature is valid
 *
 * @example
 * // Verify with explicit secret
 * const isValid = verifySubscriptionSignatureWithSecret(params, signature, app.apiKey)
 */
export function verifySubscriptionSignatureWithSecret(
  params: URLSearchParams,
  signature: string,
  secret: string
): boolean {
  const paramsToVerify = new URLSearchParams(params)
  paramsToVerify.delete('signature')
  paramsToVerify.sort()

  const canonicalString = paramsToVerify.toString()
  const expectedSignature = createHmac('sha256', secret)
    .update(canonicalString)
    .digest('hex')

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

// ────────────────────────────────────────────────────────────────────────────────
// SDK helpers - use MDK_ACCESS_TOKEN from environment
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Generate a signed URL for renewing a subscription.
 * When visited, creates a renewal checkout and redirects to the checkout page.
 * Uses MDK_ACCESS_TOKEN from environment.
 *
 * @example
 * const url = createRenewalSubscriptionUrl({
 *   subscriptionId: 'sub_abc123',
 * })
 * // Returns: /api/mdk?action=renewSubscription&subscriptionId=sub_abc123&signature=...
 */
export function createRenewalSubscriptionUrl(options: CreateRenewalSubscriptionUrlOptions): string {
  const basePath = options.basePath ?? '/api/mdk'
  const accessToken = process.env.MDK_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('MDK_ACCESS_TOKEN is required for creating subscription URLs')
  }

  const additionalParams = options.checkoutPath ? { checkoutPath: options.checkoutPath } : undefined
  const signature = generateSubscriptionSignature(
    'renewSubscription',
    options.subscriptionId,
    accessToken,
    additionalParams
  )

  const urlParams = new URLSearchParams()
  urlParams.set('action', 'renewSubscription')
  urlParams.set('subscriptionId', options.subscriptionId)
  if (options.checkoutPath) {
    urlParams.set('checkoutPath', options.checkoutPath)
  }
  urlParams.set('signature', signature)

  return `${basePath}?${urlParams.toString()}`
}

/**
 * Generate a signed URL for canceling a subscription.
 * Points directly to the MDK-hosted cancel page.
 * Uses MDK_ACCESS_TOKEN from environment.
 *
 * @example
 * const url = createCancelSubscriptionUrl({
 *   subscriptionId: 'sub_abc123',
 * })
 * // Returns: https://www.moneydevkit.com/subscription/cancel?subscriptionId=sub_abc123&signature=...
 */
export function createCancelSubscriptionUrl(options: CreateCancelSubscriptionUrlOptions): string {
  const accessToken = process.env.MDK_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('MDK_ACCESS_TOKEN is required for creating subscription URLs')
  }

  const signature = generateSubscriptionSignature(
    'cancelSubscription',
    options.subscriptionId,
    accessToken
  )

  const urlParams = new URLSearchParams()
  urlParams.set('subscriptionId', options.subscriptionId)
  urlParams.set('signature', signature)

  return `${MDK_HOST}/subscription/cancel?${urlParams.toString()}`
}

/**
 * Verify the HMAC signature of subscription URL params.
 * Uses constant-time comparison to prevent timing attacks.
 * Uses MDK_ACCESS_TOKEN from environment.
 */
export function verifySubscriptionSignature(params: URLSearchParams, signature: string): boolean {
  const accessToken = process.env.MDK_ACCESS_TOKEN
  if (!accessToken) return false

  return verifySubscriptionSignatureWithSecret(params, signature, accessToken)
}

/**
 * Safely join a base path with a segment, avoiding double slashes.
 */
function joinPath(base: string, segment: string): string {
  if (base === '/') return `/${segment}`
  return `${base}/${segment}`
}

/**
 * Helper to redirect to checkout error page.
 */
function redirectToCheckoutError(
  origin: string,
  checkoutPath: string,
  code: string,
  message: string
): Response {
  const errorUrl = new URL(joinPath(checkoutPath, 'error'), origin)
  errorUrl.searchParams.set('error', code)
  errorUrl.searchParams.set('message', message)
  return Response.redirect(errorUrl.toString(), 302)
}

/**
 * Get the origin from a request, respecting proxy headers.
 * Uses Host header to handle Docker port mapping correctly.
 */
function getRequestOrigin(request: Request, fallbackUrl: URL): string {
  const host = request.headers.get('host')
  if (host) {
    const protocol = request.headers.get('x-forwarded-proto') ?? fallbackUrl.protocol.replace(':', '')
    return `${protocol}://${host}`
  }
  return fallbackUrl.origin
}

/**
 * Handle a renewal subscription request from a signed URL.
 * Creates a renewal checkout, generates an invoice, and redirects to the checkout page.
 */
export async function handleRenewSubscriptionFromUrl(
  request: Request,
  url: URL,
  params: URLSearchParams
): Promise<Response> {
  const subscriptionId = params.get('subscriptionId')
  const checkoutPath = sanitizeCheckoutPath(params.get('checkoutPath'))
  const origin = getRequestOrigin(request, url)

  if (!subscriptionId) {
    return redirectToCheckoutError(origin, checkoutPath, 'missing_subscription_id', 'Missing subscription ID')
  }

  try {
    const client = createMoneyDevKitClient()
    const node = createMoneyDevKitNode()
    const result = await client.subscriptions.createRenewalCheckout({ subscriptionId })
    const checkout = await client.checkouts.get({ id: result.checkoutId })

    // Renewal checkouts are auto-confirmed - generate invoice if needed
    if (checkout.status === 'CONFIRMED') {
      const invoice = checkout.invoiceScid
        ? node.invoices.createWithScid(checkout.invoiceScid, checkout.invoiceAmountSats)
        : node.invoices.create(checkout.invoiceAmountSats)

      await client.checkouts.registerInvoice({
        paymentHash: invoice.paymentHash,
        invoice: invoice.invoice,
        invoiceExpiresAt: invoice.expiresAt,
        checkoutId: checkout.id,
        nodeId: node.id,
        scid: invoice.scid,
      })
    }

    const checkoutUrl = new URL(joinPath(checkoutPath, result.checkoutId), origin)
    return Response.redirect(checkoutUrl.toString(), 302)
  } catch (err) {
    const error = err as { data?: { code?: string }; message?: string }
    const code = error.data?.code
    const message = error.message ?? (err instanceof Error ? err.message : 'Failed to create renewal checkout')

    if (code === 'ALREADY_RENEWED' || code === 'SUBSCRIPTION_CANCELED' || code === 'SUBSCRIPTION_NOT_FOUND') {
      return redirectToCheckoutError(origin, checkoutPath, code.toLowerCase(), message)
    }

    return redirectToCheckoutError(origin, checkoutPath, 'renewal_failed', message)
  }
}
