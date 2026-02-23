import type { Currency } from '@moneydevkit/api-contract'
import { createMoneyDevKitClient, createMoneyDevKitNode } from '../mdk'
import { is_preview_environment } from '../preview'
import {
  createL402Credential,
  parseAuthorizationHeader,
  verifyL402Credential,
  verifyPreimage,
} from './token'

/**
 * Configuration for the withPayment wrapper.
 * Defines pricing and token expiry for L402-gated endpoints.
 */
export type PaymentConfig = {
  /** Fixed amount or async callback that receives the request and returns the amount. */
  amount: number | ((req: Request) => number | Promise<number>)
  /** Currency for pricing. SAT for direct satoshi amounts, USD for fiat conversion. */
  currency: Currency
  /** How long the credential (and invoice) remain valid, in seconds. Default: 900 (15 min). */
  expirySeconds?: number
}

type Handler = (req: Request, context?: any) => Response | Promise<Response>

/** Default credential and invoice expiry: 15 minutes. */
const DEFAULT_EXPIRY_SECONDS = 900

/**
 * Wrap a route handler with L402 payment gating.
 *
 * Unauthenticated requests receive a 402 response with a Lightning invoice.
 * Requests with a valid `Authorization: L402 <macaroon>:<preimage>` header
 * are forwarded to the inner handler after stateless verification.
 *
 * Also accepts the legacy LSAT scheme per bLIP-26 backwards compatibility.
 */
export function withPayment(config: PaymentConfig, handler: Handler): Handler {
  return async (req: Request, context?: any): Promise<Response> => {
    const accessToken = process.env.MDK_ACCESS_TOKEN
    if (!accessToken) {
      return errorResponse(500, {
        code: 'configuration_error',
        message: 'MDK_ACCESS_TOKEN is not configured',
        suggestion: 'Set the MDK_ACCESS_TOKEN environment variable',
      })
    }

    // Check for L402/LSAT authorization header
    const authHeader = req.headers.get('authorization')
    const parsed = parseAuthorizationHeader(authHeader)

    if (!parsed.valid) {
      // No auth or wrong scheme -> issue a new invoice
      return await create402Response(req, config, accessToken)
    }

    // Verify credential integrity and expiry
    const credentialResult = verifyL402Credential(parsed.macaroon, accessToken)

    if (!credentialResult.valid) {
      if (credentialResult.reason === 'expired') {
        // Expired credential -> issue a fresh invoice
        return await create402Response(req, config, accessToken)
      }
      return errorResponse(401, {
        code: 'invalid_credential',
        message: 'Invalid or malformed L402 credential',
      })
    }

    // Verify credential was issued for this specific endpoint
    const expectedResource = `${req.method}:${new URL(req.url).pathname}`
    if (credentialResult.resource !== expectedResource) {
      return errorResponse(403, {
        code: 'resource_mismatch',
        message: 'Credential was not issued for this resource',
      })
    }

    // Verify credential was issued for the current price
    let currentAmount: number
    try {
      currentAmount = typeof config.amount === 'function'
        ? await Promise.resolve(config.amount(req))
        : config.amount
    } catch (err) {
      return errorResponse(500, {
        code: 'pricing_error',
        message: 'Failed to determine price',
        details: err instanceof Error ? err.message : String(err),
      })
    }

    if (credentialResult.amount !== currentAmount || credentialResult.currency !== config.currency) {
      return errorResponse(403, {
        code: 'amount_mismatch',
        message: 'Credential was not issued for this price',
      })
    }

    // Verify payment proof (skip in preview/sandbox mode)
    const isPreview = is_preview_environment()
    if (!isPreview) {
      if (!verifyPreimage(parsed.preimage, credentialResult.paymentHash)) {
        return errorResponse(401, {
          code: 'invalid_payment_proof',
          message: 'Invalid payment preimage',
        })
      }
    }

    // Payment verified — call the inner handler
    return handler(req, context)
  }
}

/**
 * Build the 402 Payment Required response with a Lightning invoice.
 * Creates a checkout on the MDK backend for dashboard visibility,
 * generates an invoice via the local Lightning node, and signs an L402 credential.
 *
 * The WWW-Authenticate header follows bLIP-26 format:
 *   L402 macaroon="<credential>", invoice="<bolt11>"
 */
async function create402Response(
  req: Request,
  config: PaymentConfig,
  accessToken: string,
): Promise<Response> {
  // Resolve dynamic pricing
  let amount: number
  try {
    amount = typeof config.amount === 'function'
      ? await Promise.resolve(config.amount(req))
      : config.amount
  } catch (err) {
    return errorResponse(500, {
      code: 'pricing_error',
      message: 'Failed to determine price',
      details: err instanceof Error ? err.message : String(err),
    })
  }

  const expirySeconds = config.expirySeconds ?? DEFAULT_EXPIRY_SECONDS
  const isPreview = is_preview_environment()

  try {
    const client = createMoneyDevKitClient()
    const node = createMoneyDevKitNode()

    // 1. Create checkout on MDK backend (gives dashboard visibility)
    const checkout = await client.checkouts.create(
      {
        amount,
        currency: config.currency,
        metadata: {
          source: '402',
          resource: req.url,
          ...(isPreview ? { sandbox: 'true' } : {}),
        },
      },
      node.id,
    )

    // The checkout should be auto-confirmed for AMOUNT type without customer data
    if (checkout.status !== 'CONFIRMED') {
      return errorResponse(502, {
        code: 'checkout_creation_failed',
        message: `Unexpected checkout status: ${checkout.status}`,
      })
    }

    // 2. Create Lightning invoice with matching expiry
    const invoiceResult = checkout.invoiceScid
      ? node.invoices.createWithScid(checkout.invoiceScid, checkout.invoiceAmountSats, expirySeconds)
      : node.invoices.create(checkout.invoiceAmountSats, expirySeconds)

    // 3. Register invoice with backend
    const pendingCheckout = await client.checkouts.registerInvoice({
      paymentHash: invoiceResult.paymentHash,
      invoice: invoiceResult.invoice,
      invoiceExpiresAt: invoiceResult.expiresAt,
      checkoutId: checkout.id,
      nodeId: node.id,
      scid: invoiceResult.scid,
    })

    node.destroy() // Clean up node connection

    // 4. Create signed L402 credential bound to this endpoint
    const expiresAt = Math.floor(invoiceResult.expiresAt.getTime() / 1000)
    const amountSats = pendingCheckout.invoiceAmountSats ?? checkout.invoiceAmountSats ?? 0
    const resource = `${req.method}:${new URL(req.url).pathname}`
    const macaroon = createL402Credential({
      paymentHash: invoiceResult.paymentHash,
      amountSats,
      expiresAt,
      accessToken,
      resource,
      amount,
      currency: config.currency,
    })

    // 5. Build 402 response with L402-compatible headers (bLIP-26)
    const wwwAuthenticate = `L402 macaroon="${macaroon}", invoice="${invoiceResult.invoice}"`

    return new Response(
      JSON.stringify({
        error: {
          code: 'payment_required',
          message: 'Payment required',
        },
        macaroon,
        invoice: invoiceResult.invoice,
        paymentHash: invoiceResult.paymentHash,
        amountSats,
        expiresAt,
      }),
      {
        status: 402,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': wwwAuthenticate,
        },
      },
    )
  } catch (err) {
    return errorResponse(502, {
      code: 'checkout_creation_failed',
      message: err instanceof Error ? err.message : 'Failed to create checkout or invoice',
    })
  }
}

/** Build a JSON error response following the MdkError format. */
function errorResponse(
  status: number,
  error: { code: string; message: string; details?: string; suggestion?: string },
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
