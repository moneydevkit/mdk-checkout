import type { Currency } from '@moneydevkit/api-contract'
import type { CustomerInput } from '../actions'
import type { CreateCheckoutParams } from '../actions'
import { createMoneyDevKitClient, deriveNodeIdFromConfig } from '../mdk'
import { is_preview_environment } from '../preview'
import {
  createL402Credential,
  parseAuthorizationHeader,
  verifyL402Credential,
  verifyPreimage,
} from './token'
import type { VerifyL402CredentialResult } from './token'

/** Sugar: a value of type T or a function that derives it from the request. */
type Dynamic<T> = T | ((req: Request) => T | Promise<T>)

/**
 * Distributive mapped type. Each branch of CreateCheckoutParams gets its own
 * fields independently dynamified, preserving the AMOUNT/PRODUCTS discrimination.
 * The `T extends unknown` triggers distribution; without it, `keyof` collapses
 * to the intersection of keys (common fields only) and branch-specific fields
 * like `amount` and `product` would not be wrapped.
 */
type Dynamify<T> = T extends unknown
  ? { [K in keyof T]: Dynamic<T[K]> }
  : never

/**
 * Configuration for `withPayment` and `withDeferredSettlement`. Mirrors
 * `CreateCheckoutParams` from actions.ts with two additions:
 *   - Every field accepts a `(req: Request) => value` resolver (or async).
 *   - `expirySeconds` controls the credential + invoice lifetime (default 900).
 *
 * The AMOUNT/PRODUCTS discriminator lives in CreateCheckoutParams. There is
 * deliberately no separate `PaymentConfig` taxonomy — keeping the contract
 * single-sourced prevents the two surfaces from drifting.
 */
export type WithPaymentConfig = Dynamify<CreateCheckoutParams> & {
  expirySeconds?: number
}

/** All system-controlled keys on `Checkout.userMetadata`. Merchants cannot override. */
const RESERVED_METADATA_KEYS = ['source', 'resource', 'sandbox'] as const

/** Sentinel for the `source` metadata key — distinguishes 402-created checkouts. */
const METADATA_SOURCE_402 = '402'

/** Sentinel for the `sandbox` metadata key when the merchant is in preview mode. */
const METADATA_SANDBOX_FLAG = 'true'

/** Resolve a Dynamic<T> against a Request, awaiting async resolvers. */
async function resolveDynamic<T>(
  value: Dynamic<T> | undefined,
  req: Request,
): Promise<T | undefined> {
  if (value === undefined) return undefined
  if (typeof value === 'function') {
    return await Promise.resolve((value as (r: Request) => T | Promise<T>)(req))
  }
  return value
}

/**
 * Compose the `userMetadata` blob attached to the Checkout on creation. The
 * precedence order is encoded in the function signature rather than a comment:
 *
 *   merchant  →  top-level title/description  →  system-reserved keys
 *
 * System-reserved keys (`source`, `resource`, `sandbox`) always win; a merchant
 * cannot spoof them. Top-level `title`/`description` beat any matching keys
 * in `merchant` for parity with `actions.ts` (the dashboard SDK uses the same
 * precedence).
 */
function composeCheckoutMetadata(args: {
  merchant: Record<string, string> | undefined
  title: string | undefined
  description: string | undefined
  resourceUrl: string
  isSandbox: boolean
}): Record<string, string> {
  return {
    ...(args.merchant ?? {}),
    ...(args.title !== undefined ? { title: args.title } : {}),
    ...(args.description !== undefined ? { description: args.description } : {}),
    source: METADATA_SOURCE_402,
    resource: args.resourceUrl,
    ...(args.isSandbox ? { sandbox: METADATA_SANDBOX_FLAG } : {}),
  }
}

/**
 * Resolve a WithPaymentConfig into a fully-evaluated CreateCheckoutParams.
 * Walks the Dynamic<T> resolvers and runs the static-validation guards.
 * Returns a Response (500) if any callback throws or static validation fails.
 *
 * Two separate try/catch blocks isolate failure provenance:
 *   - amount/product resolution → `pricing_error` (back-compat with pre-PR)
 *   - title/description/metadata resolution → `config_error` (MDK-707 addition)
 *
 * Static-validation failures (amount not finite, product empty string) use
 * `config_invalid` — they're config bugs, not runtime callback failures.
 */
async function resolveConfig(
  config: WithPaymentConfig,
  req: Request,
): Promise<CreateCheckoutParams | Response> {
  const isProducts = config.type === 'PRODUCTS'

  // Pricing-related resolution (amount or product). Throws → pricing_error.
  let amount: number | undefined
  let product: string | undefined
  try {
    if (isProducts) {
      product = await resolveDynamic(config.product, req)
    } else {
      amount = await resolveDynamic(config.amount, req)
    }
  } catch (err) {
    return errorResponse(500, {
      code: 'pricing_error',
      message: 'Failed to determine price',
      details: err instanceof Error ? err.message : String(err),
      phase: 'create',
    })
  }

  // Static-validation guards (catches JS callers bypassing the TS types).
  if (isProducts) {
    if (typeof product !== 'string' || product.length === 0) {
      return errorResponse(500, {
        code: 'config_invalid',
        message: 'PRODUCTS-mode withPayment requires a non-empty product id',
      })
    }
  } else {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return errorResponse(500, {
        code: 'config_invalid',
        message: 'AMOUNT-mode withPayment requires a finite numeric amount',
      })
    }
  }

  // Non-pricing resolution (title, description, metadata). Throws → config_error.
  // title/description only resolve in AMOUNT mode — the contract excludes
  // them from PRODUCTS, so a JS caller bypassing the types gets a silent drop
  // rather than an executed callback whose result we'd discard anyway.
  let title: string | undefined
  let description: string | undefined
  let merchantMetadata: Record<string, unknown> | undefined
  try {
    if (!isProducts) {
      title = await resolveDynamic(config.title, req)
      description = await resolveDynamic(config.description, req)
    }
    merchantMetadata = await resolveDynamic(config.metadata, req)
  } catch (err) {
    return errorResponse(500, {
      code: 'config_error',
      message: 'Failed to resolve withPayment config',
      details: err instanceof Error ? err.message : String(err),
    })
  }

  // Return the plain CreateCheckoutParams shape. Branch on isProducts so TS
  // narrows correctly; title/description are AMOUNT-only by contract (the
  // product's own name/description drive the dashboard + payer-facing surfaces
  // in PRODUCTS mode), so the PRODUCTS branch omits them entirely.
  if (isProducts) {
    return {
      type: 'PRODUCTS',
      product: product!,
      metadata: merchantMetadata,
      customer: config.customer as CustomerInput | undefined,
      requireCustomerData: config.requireCustomerData as string[] | undefined,
    }
  }
  return {
    type: 'AMOUNT',
    amount: amount!,
    currency: config.currency as Currency,
    title,
    description,
    metadata: merchantMetadata,
    customer: config.customer as CustomerInput | undefined,
    requireCustomerData: config.requireCustomerData as string[] | undefined,
  }
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

/** Narrow type for a verified-valid credential, for use inside the mode helpers. */
type ValidCredential = Extract<VerifyL402CredentialResult, { valid: true }>

/**
 * Retry verification: re-resolve the endpoint's current price and compare to
 * the credential's frozen amount + currency. This is uniform across AMOUNT
 * and PRODUCTS modes — the credential carries no mode-specific binding (no
 * productId/priceId), so the endpoint's `config.type` decides how to compute
 * the current price.
 *
 *   AMOUNT   → re-run config.amount (with dynamic resolver if any).
 *   PRODUCTS → resolve config.product, fetch the product from mdk.com, look
 *              for a price snapshot whose (priceAmount, currency) matches the
 *              credential. No match = the price was retired or the product
 *              archived = 403 amount_mismatch (recoverable).
 *
 * Returns `null` on success, or a Response describing the failure.
 *
 * Caveat: if config.product is a dynamic resolver that returns different
 * product IDs on issue vs retry, the lookup will mismatch even for a
 * legitimately-issued credential. Merchants should keep config.product stable.
 */
async function verifyCurrentPrice(
  credential: ValidCredential,
  config: WithPaymentConfig,
  req: Request,
): Promise<Response | null> {
  let currentAmount: number
  let currentCurrency: string

  try {
    if (config.type === 'PRODUCTS') {
      const productId = await resolveDynamic(config.product, req)
      if (typeof productId !== 'string' || productId.length === 0) {
        // Defensive: PRODUCTS config without a valid product ID at retry time.
        return errorResponse(500, {
          code: 'pricing_error',
          message: 'PRODUCTS endpoint config.product resolved to an invalid value',
          phase: 'verify',
        })
      }
      const client = createMoneyDevKitClient()
      const product = await client.products.get({ id: productId })
      const matchingPrice = product.prices.find(
        (p: { priceAmount: number | null; currency: string }) =>
          p.priceAmount === credential.amount && p.currency === credential.currency,
      )
      if (!matchingPrice) {
        // Product exists but the price snapshot the credential paid for is gone.
        return errorResponse(403, {
          code: 'amount_mismatch',
          message: 'Credential was not issued for any currently-active price of this product',
          recoverable: true,
        })
      }
      currentAmount = matchingPrice.priceAmount as number
      currentCurrency = matchingPrice.currency
    } else {
      const amountField = config.amount as Dynamic<number>
      currentAmount = typeof amountField === 'function'
        ? await Promise.resolve(amountField(req))
        : amountField
      currentCurrency = config.currency as string
    }
  } catch (err) {
    return errorResponse(500, {
      code: 'pricing_error',
      message: 'Failed to determine current price',
      details: err instanceof Error ? err.message : String(err),
      phase: 'verify',
    })
  }

  if (credential.amount !== currentAmount || credential.currency !== currentCurrency) {
    return errorResponse(403, {
      code: 'amount_mismatch',
      message: 'Credential was not issued for the endpoint\'s current price',
      recoverable: true,
    })
  }

  return null
}

/**
 * Verify the L402 credential from the request. Top-level dispatcher:
 *   1. Parse auth header → 401 invalid_credential / 402 dispatch on absent
 *   2. Verify HMAC signature → 401 invalid_credential
 *   3. Resource match → 403 resource_mismatch
 *   4. Price verification via verifyCurrentPrice
 *   5. Preimage proof (skipped in preview mode) → 401 invalid_payment_proof
 *
 * Returns { paymentHash } on success, or a Response describing the failure.
 */
async function verifyCredential(
  req: Request,
  config: WithPaymentConfig,
  accessToken: string,
): Promise<VerifiedCredential | Response> {
  const authHeader = req.headers.get('authorization')
  const parsed = parseAuthorizationHeader(authHeader)

  if (!parsed.valid) {
    if (parsed.attempted) {
      // L402/LSAT scheme present but malformed - don't issue a new invoice
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

  // Price verification: re-resolve the current price and compare to the frozen credential values.
  const priceError = await verifyCurrentPrice(credentialResult, config, req)
  if (priceError) return priceError

  // Verify payment proof (skip in preview/sandbox mode)
  if (!is_preview_environment()) {
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
export function withPayment(config: WithPaymentConfig, handler: Handler): Handler {
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
export function withDeferredSettlement(config: WithPaymentConfig, handler: DeferredHandler): Handler {
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
 * Creates a checkout on the MDK backend for dashboard visibility, mints an
 * invoice through the WS control plane, and signs an L402 credential bound
 * to this endpoint.
 *
 * The WWW-Authenticate header follows bLIP-26 format:
 *   L402 macaroon="<credential>", invoice="<bolt11>"
 * (with an additional `sandbox="true"` parameter in preview mode).
 */
async function create402Response(
  req: Request,
  config: WithPaymentConfig,
  accessToken: string,
): Promise<Response> {
  const expirySeconds = config.expirySeconds ?? DEFAULT_EXPIRY_SECONDS

  const resolved = await resolveConfig(config, req)
  if (resolved instanceof Response) return resolved

  const isPreview = is_preview_environment()

  try {
    const client = createMoneyDevKitClient()
    const nodeId = deriveNodeIdFromConfig()

    const metadata = composeCheckoutMetadata({
      merchant: resolved.metadata as Record<string, string> | undefined,
      title: resolved.title,
      description: resolved.description,
      resourceUrl: req.url,
      isSandbox: isPreview,
    })

    // resolved is already a CreateCheckoutParams. Spread it and override
    // metadata with the composed (system-keys-on-top) version.
    const checkout = await client.checkouts.create(
      { ...resolved, metadata },
      nodeId,
    )

    if (checkout.status !== 'CONFIRMED') {
      return errorResponse(502, {
        code: 'checkout_creation_failed',
        message: `Unexpected checkout status: ${checkout.status}`,
      })
    }

    const pendingCheckout = await client.checkouts.mintInvoice({
      checkoutId: checkout.id,
      expirySecs: expirySeconds,
    })

    const invoiceFromDb = pendingCheckout.invoice
    if (!invoiceFromDb) {
      return errorResponse(502, {
        code: 'invoice_mint_failed',
        message: 'mintInvoice returned a checkout without an invoice',
      })
    }

    const expiresAt = Math.floor(invoiceFromDb.expiresAt.getTime() / 1000)
    const amountSats = pendingCheckout.invoiceAmountSats ?? checkout.invoiceAmountSats ?? 0
    const resource = `${req.method}:${new URL(req.url).pathname}`

    // Credential amount/currency:
    //   AMOUNT   → merchant's resolved input.
    //   PRODUCTS → resolved from the pending checkout (MDK-server derived).
    const credentialAmount = resolved.type === 'PRODUCTS'
      ? pendingCheckout.providedAmount ?? 0
      : resolved.amount
    const credentialCurrency = resolved.type === 'PRODUCTS'
      ? pendingCheckout.currency ?? 'SAT'
      : resolved.currency

    const macaroon = createL402Credential({
      paymentHash: invoiceFromDb.paymentHash,
      amountSats,
      expiresAt,
      accessToken,
      resource,
      amount: credentialAmount,
      currency: credentialCurrency,
    })

    const wwwAuthenticate = isPreview
      ? `L402 macaroon="${macaroon}", invoice="${invoiceFromDb.invoice}", sandbox="true"`
      : `L402 macaroon="${macaroon}", invoice="${invoiceFromDb.invoice}"`

    return new Response(
      JSON.stringify({
        error: { code: 'payment_required', message: 'Payment required' },
        macaroon,
        invoice: invoiceFromDb.invoice,
        paymentHash: invoiceFromDb.paymentHash,
        amountSats,
        expiresAt,
        ...(isPreview ? { sandbox: true } : {}),
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

/**
 * Error envelope returned in JSON bodies. `recoverable` and `phase` are
 * optional extensions added in this refactor:
 *
 *   recoverable=true  → the client should discard the credential and request
 *                       a fresh 402 (e.g., price changed, product/price retired)
 *   recoverable=false → the client has fundamentally wrong credential for this
 *                       endpoint (e.g., AMOUNT credential on PRODUCTS endpoint)
 *   phase             → for pricing_error specifically, distinguishes failures
 *                       at 402 issuance ("create") vs authenticated retry
 *                       ("verify"). Helps merchants grep logs by failure point.
 *
 * `details` stays a string for back-compat with the pre-refactor contract.
 */
type L402ErrorEnvelope = {
  code: string
  message: string
  details?: string
  suggestion?: string
  recoverable?: boolean
  phase?: 'create' | 'verify'
}

/** Build a JSON error response following the MdkError format. */
function errorResponse(status: number, error: L402ErrorEnvelope): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
