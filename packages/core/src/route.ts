import { z } from 'zod'

import { handleBalance } from './handlers/balance'
import {
  handleConfirmCheckout,
  handleCreateCheckout,
  handleGetCheckout,
  handleCreateCheckoutFromUrl,
  parseCheckoutQueryParams,
  verifyCheckoutSignature,
  sanitizeCheckoutPath,
} from './handlers/checkout'

// Re-export for use in nextjs package
export { createCheckoutUrl } from './handlers/checkout'
export type { CreateCheckoutUrlOptions } from './handlers/checkout'
import { listChannels } from './handlers/list_channels'
import { handlePayBolt11 } from './handlers/pay_bolt_11'
import { handlePayBolt12 } from './handlers/pay_bolt_12'
import { handlePreviewPayInvoice } from './handlers/pay_invoice'
import { handlePayLNUrl } from './handlers/pay_ln_url'
import { handlePing } from './handlers/ping'
import { handleListProducts } from './handlers/products'
import { handleSyncRgs } from './handlers/sync_rgs'
import { handleMdkWebhook } from './handlers/webhooks'
import { error, log } from './logging'

export type RouteHandler = (request: Request) => Promise<Response>
type RouteAuth = 'secret' | 'csrf'
type RouteConfig = { handler: RouteHandler; auth: RouteAuth }

const WEBHOOK_SECRET_HEADER = 'x-moneydevkit-webhook-secret'

const routeSchema = z.enum([
  'webhook',
  'webhooks',
  'pay_bolt_12',
  'balance',
  'ping',
  'pay_ln_url',
  'list_channels',
  'pay_bolt11',
  'create_checkout',
  'get_checkout',
  'confirm_checkout',
  'pay_invoice',
  'sync_rgs',
  'list_products',
])
export type UnifiedRoute = z.infer<typeof routeSchema>

const ROUTE_CONFIG: Record<UnifiedRoute, RouteConfig> = {
  webhook: { handler: handleMdkWebhook, auth: 'secret' },
  webhooks: { handler: handleMdkWebhook, auth: 'secret' },
  pay_bolt_12: { handler: handlePayBolt12, auth: 'secret' },
  balance: { handler: handleBalance, auth: 'secret' },
  ping: { handler: handlePing, auth: 'secret' },
  pay_ln_url: { handler: handlePayLNUrl, auth: 'secret' },
  list_channels: { handler: listChannels, auth: 'secret' },
  pay_bolt11: { handler: handlePayBolt11, auth: 'secret' },
  create_checkout: { handler: handleCreateCheckout, auth: 'csrf' },
  get_checkout: { handler: handleGetCheckout, auth: 'csrf' },
  confirm_checkout: { handler: handleConfirmCheckout, auth: 'csrf' },
  pay_invoice: { handler: handlePreviewPayInvoice, auth: 'csrf' },
  sync_rgs: { handler: handleSyncRgs, auth: 'secret' },
  list_products: { handler: handleListProducts, auth: 'csrf' },
}

const HANDLERS: Partial<Record<UnifiedRoute, RouteHandler>> = {}
const CSRF_HEADER = 'x-moneydevkit-csrf-token'
const CSRF_COOKIE = 'mdk_csrf'

function assignDefaultHandlers() {
  for (const route of Object.keys(ROUTE_CONFIG) as UnifiedRoute[]) {
    HANDLERS[route] = ROUTE_CONFIG[route].handler
  }
}

assignDefaultHandlers()

const ROUTE_BODY_KEYS = ['handler', 'route', 'target'] as const

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function validateWebhookSecret(request: Request, { silent = false } = {}): Response | null {
  const expectedSecret = process.env.MDK_ACCESS_TOKEN

  if (!expectedSecret) {
    if (!silent) {
      error('MDK_ACCESS_TOKEN environment variable is not configured.')
    }
    return jsonResponse(500, { error: 'Webhook secret is not configured.' })
  }

  const providedSecret = request.headers.get(WEBHOOK_SECRET_HEADER)

  if (!providedSecret || providedSecret !== expectedSecret) {
    if (!silent) {
      log('Unauthorized webhook request received. Please confirm that MDK_ACCESS_TOKEN is set to the correct value.')
    }
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  return null
}

export function __setHandlerForTest(route: UnifiedRoute, handler: RouteHandler | null) {
  if (handler) {
    HANDLERS[route] = handler
  } else {
    delete HANDLERS[route]
  }
}

export function __resetHandlersForTest() {
  assignDefaultHandlers()
}

async function resolveRoute(request: Request): Promise<UnifiedRoute | null> {
  const contentType = request.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    return null
  }

  try {
    const body = (await request.clone().json()) as Record<string, unknown>
    for (const key of ROUTE_BODY_KEYS) {
      const value = body?.[key]
      if (typeof value === 'string') {
        const parsed = routeSchema.safeParse(value.toLowerCase())
        if (parsed.success) {
          return parsed.data
        }
      }
    }
  } catch {
    // Ignore JSON parse errors; downstream handlers will try again if needed.
  }

  return null
}

function routeRequiresSecret(route: UnifiedRoute): boolean {
  return ROUTE_CONFIG[route]?.auth === 'secret'
}

function routeRequiresCsrf(route: UnifiedRoute): boolean {
  return ROUTE_CONFIG[route]?.auth === 'csrf'
}

function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const [key, ...rest] = c.split('=')
        return [key, rest.join('=')]
      }),
  )
}

function validateCsrf(request: Request): Response | null {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host) {
    try {
      const originHost = new URL(origin).host
      if (originHost !== host) {
        return jsonResponse(403, { error: 'Invalid origin' })
      }
    } catch {
      // If origin is malformed, fall through to token validation.
    }
  }

  const cookies = parseCookies(request)
  const cookieToken = cookies[CSRF_COOKIE]
  const headerToken = request.headers.get(CSRF_HEADER)

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  return null
}

async function handleRequest(request: Request) {
  const route = await resolveRoute(request)

  if (!route) {
    return jsonResponse(400, {
      error: `Missing or invalid handler. Include a JSON body with a "handler" property set to one of ${routeSchema.options.join(', ')}.`,
    })
  }

  if (routeRequiresSecret(route)) {
    const authError = validateWebhookSecret(request)

    if (authError) {
      return authError
    }
  } else if (routeRequiresCsrf(route)) {
    // Allow webhook secret as an override for server-to-server calls; otherwise require a CSRF token.
    const secretError = validateWebhookSecret(request, { silent: true })
    if (secretError) {
      const csrfError = validateCsrf(request)
      if (csrfError) {
        return csrfError
      }
    }
  }

  const handler = HANDLERS[route]

  if (!handler) {
    return jsonResponse(501, {
      error: `Handler "${route}" not found.`,
    })
  }

  try {
    return await handler(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error('Unhandled error in route handler:', message)
    return jsonResponse(500, { error: message })
  }
}

export function createUnifiedHandler() {
  return (request: Request) => handleRequest(request)
}

export async function POST(request: Request) {
  const handler = createUnifiedHandler()
  return handler(request)
}

/**
 * Helper to redirect to checkout error page.
 * Uses 'error' as a placeholder ID so it matches the /checkout/[id] route.
 */
function redirectToCheckoutError(
  baseUrl: URL,
  checkoutPath: string,
  code: string,
  message: string
): Response {
  const errorUrl = new URL(`${checkoutPath}/error`, baseUrl.origin)
  errorUrl.searchParams.set('error', code)
  errorUrl.searchParams.set('message', message)
  return Response.redirect(errorUrl.toString(), 302)
}

/**
 * GET handler for URL-based checkout creation.
 *
 * Creates a checkout from signed URL query params and redirects to the checkout page.
 *
 * @example
 * GET /api/mdk?action=createCheckout&title=Product&amount=2999&signature=abc123
 *   -> Verifies signature
 *   -> Creates checkout
 *   -> 302 redirect to /checkout/{id}
 *
 * Users should generate URLs using the `createCheckoutUrl` helper to ensure proper signing.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const params = url.searchParams

  // Only handle createCheckout action
  if (params.get('action') !== 'createCheckout') {
    return new Response('Not found', { status: 404 })
  }

  // Sanitize checkoutPath early to prevent open redirect attacks
  const checkoutPath = sanitizeCheckoutPath(params.get('checkoutPath'))

  // Verify signature is present
  const signature = params.get('signature')
  if (!signature) {
    return redirectToCheckoutError(url, checkoutPath, 'missing_signature', 'Missing signature')
  }

  // Verify signature is valid
  const isValid = verifyCheckoutSignature(params, signature)
  if (!isValid) {
    return redirectToCheckoutError(url, checkoutPath, 'invalid_signature', 'Invalid signature')
  }

  // Parse and validate params
  const checkoutParams = parseCheckoutQueryParams(params)
  const result = await handleCreateCheckoutFromUrl(checkoutParams)

  if ('error' in result) {
    return redirectToCheckoutError(url, checkoutPath, result.error.code, result.error.message)
  }

  // Success - redirect to checkout page (use sanitized checkoutPath, not result.data.checkoutPath)
  const checkoutUrl = new URL(`${checkoutPath}/${result.data.id}`, url.origin)
  return Response.redirect(checkoutUrl.toString(), 302)
}
