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
 * Configuration for the withPayment and withDeferredConfirmation wrappers.
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

/** Result of calling the settle callback in withDeferredConfirmation. */
export type SettleResult = { settled: true } | { settled: false; error: string }

/**
 * Handler that receives a settle callback for deferred confirmation.
 * Call settle() after successfully delivering the service to mark the credential as used.
 * If settle() is never called, the credential remains valid and the payer can retry.
 */
type DeferredHandler = (
  req: Request,
  settle: () => Promise<SettleResult>,
  context?: any,
) => Response | Promise<Response>

/** Default credential and invoice expiry: 15 minutes. */
const DEFAULT_EXPIRY_SECONDS = 900

/** Successful credential verification result. */
type VerifiedCredential = {
  paymentHash: string
}

/**
 * Verify the L402 credential from the request.
 * Checks HMAC integrity, resource binding, amount match, and preimage proof.
 * Returns the payment hash on success, or an error Response on failure.
 */
async function verifyCredential(
  req: Request,
  config: PaymentConfig,
  accessToken: string,
): Promise<VerifiedCredential | Response> {
  const authHeader = req.headers.get('authorization')
  const parsed = parseAuthorizationHeader(authHeader)

  if (!parsed.valid) {
    // L402/LSAT scheme present but malformed - don't issue a new invoice
    if (parsed.attempted) {
      return errorResponse(401, {
        code: 'invalid_credential',
        message: 'Malformed L402 authorization header',
      })
    }
    // No L402 auth at all - issue a new invoice
    return await create402Response(req, config, accessToken)
  }

  // Verify credential integrity (expiry is NOT checked - a paid credential never expires)
  const credentialResult = verifyL402Credential(parsed.macaroon, accessToken)

  if (!credentialResult.valid) {
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

  return { paymentHash: credentialResult.paymentHash }
}

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

    const result = await verifyCredential(req, config, accessToken)
    if (result instanceof Response) {
      return result
    }

    // Atomically redeem the L402 credential (one payment = one use)
    const client = createMoneyDevKitClient()
    const redeemResult = await client.checkouts.redeemL402({
      paymentHash: result.paymentHash,
    })

    if (!redeemResult.redeemed) {
      return errorResponse(401, {
        code: 'credential_consumed',
        message: 'This L402 credential has already been used',
      })
    }

    // Payment verified and redeemed - call the inner handler
    return handler(req, context)
  }
}

/**
 * Wrap a route handler with L402 payment gating and deferred confirmation.
 *
 * Like withPayment, but does NOT automatically mark the credential as used.
 * Instead, the handler receives a `settle` callback. The merchant calls
 * settle() after successfully delivering the service. If settle() is never
 * called (e.g. the handler throws or the service fails), the credential
 * remains valid and the payer can retry with the same preimage.
 *
 * settle() is callable only once - subsequent calls return an error.
 */
export function withDeferredSettlement(config: PaymentConfig, handler: DeferredHandler): Handler {
  return async (req: Request, context?: any): Promise<Response> => {
    const accessToken = process.env.MDK_ACCESS_TOKEN
    if (!accessToken) {
      return errorResponse(500, {
        code: 'configuration_error',
        message: 'MDK_ACCESS_TOKEN is not configured',
        suggestion: 'Set the MDK_ACCESS_TOKEN environment variable',
      })
    }

    const result = await verifyCredential(req, config, accessToken)
    if (result instanceof Response) {
      return result
    }

    // Check if the credential has already been consumed (without consuming it)
    const client = createMoneyDevKitClient()
    const checkResult = await client.checkouts.checkL402({
      paymentHash: result.paymentHash,
    })

    if (checkResult.redeemed) {
      return errorResponse(401, {
        code: 'credential_consumed',
        message: 'This L402 credential has already been used',
      })
    }

    // Build the one-shot settle callback
    let settled = false
    const settle = async (): Promise<SettleResult> => {
      if (settled) {
        return { settled: false, error: 'already_settled' }
      }
      settled = true

      const redeemResult = await client.checkouts.redeemL402({
        paymentHash: result.paymentHash,
      })

      if (!redeemResult.redeemed) {
        return { settled: false, error: redeemResult.reason ?? 'redeem_failed' }
      }

      return { settled: true }
    }

    // Payment verified but NOT redeemed - merchant decides when to settle
    return handler(req, settle, context)
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

  let node: ReturnType<typeof createMoneyDevKitNode> | undefined
  try {
    const client = createMoneyDevKitClient()
    node = createMoneyDevKitNode()

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
  } finally {
    node?.destroy()
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
