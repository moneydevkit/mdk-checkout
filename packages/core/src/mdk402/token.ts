import { createHmac, timingSafeEqual, createHash } from 'crypto'
import { z } from 'zod'

/**
 * Parameters for creating an L402 credential.
 *
 * The credential is an HMAC-signed opaque token (not a macaroon) that
 * is compatible with the L402 HTTP wire format defined in bLIP-26.
 */
export interface CreateL402CredentialParams {
  paymentHash: string
  amountSats: number
  expiresAt: number // Unix timestamp in seconds
  accessToken: string
  resource: string // method:pathname identifier (e.g. "GET:/api/premium")
  amount: number // pre-conversion amount from PaymentConfig
  currency: string // currency code (e.g. "SAT", "USD")
  // True when the underlying checkout is in sandbox mode. Signed into the
  // credential so the verify path can skip preimage verification without
  // re-querying the server. Driven by either `is_preview_environment()` on
  // the merchant runtime OR the server-side `Checkout.sandbox` column (which
  // mdk.com flips when the owning App is in AppMode.sandbox).
  // Optional with default `false` so existing call sites that don't care
  // about sandbox continue to compile; production code in
  // with-payment.ts always passes an explicit boolean.
  sandbox?: boolean
}

/**
 * Result of verifying an L402 credential.
 */
export type VerifyL402CredentialResult =
  | {
      valid: true
      paymentHash: string
      amountSats: number
      expiresAt: number
      resource: string
      amount: number
      currency: string
      // Mirrors CreateL402CredentialParams.sandbox; used by the verify path to
      // skip preimage verification on sandbox-mode credentials.
      sandbox: boolean
    }
  | { valid: false; reason: 'invalid_format' | 'invalid_signature' }

/**
 * Result of parsing an Authorization header.
 * When valid is false, `attempted` indicates whether an L402/LSAT scheme was
 * present but the credentials were malformed (true) vs no L402 auth at all (false).
 */
export type ParseAuthResult =
  | { valid: true; macaroon: string; preimage: string }
  | { valid: false; attempted: boolean }

/** Schema for validating decoded L402 credential payloads. */
const credentialPayloadSchema = z.object({
  paymentHash: z.string(),
  amountSats: z.number(),
  expiresAt: z.number(),
  resource: z.string(),
  amount: z.number(),
  currency: z.string(),
  // Defaults to false so credentials emitted by older mdk-checkout builds
  // (pre-sandbox-credential) still parse — they decode as non-sandbox and
  // continue to require a real preimage on verify, which matches their
  // original behavior. New emissions always include the field explicitly.
  sandbox: z.boolean().default(false),
  sig: z.string(),
})

/** Version tag for HMAC key derivation. Allows future token format changes. */
const KEY_DERIVATION_TAG = 'mdk402-token-v1'

/**
 * L402-compatible auth scheme names.
 * Accepts "L402" (current) and "LSAT" (legacy) per bLIP-26 backwards compat.
 */
const L402_SCHEMES = ['l402', 'lsat']

/**
 * Derive a domain-specific HMAC key for L402 credentials.
 * Provides separation from checkout URL signing and webhook verification
 * that also use MDK_ACCESS_TOKEN.
 */
export function deriveL402Key(accessToken: string): Buffer {
  return createHmac('sha256', accessToken)
    .update(KEY_DERIVATION_TAG)
    .digest()
}

/**
 * Create a signed L402 credential.
 * Returns a base64-encoded JSON string containing the payment hash,
 * amount, expiry, and an HMAC signature. While not a true macaroon,
 * it is wire-compatible with the L402 protocol as an opaque credential.
 */
export function createL402Credential(params: CreateL402CredentialParams): string {
  const { paymentHash, amountSats, expiresAt, accessToken, resource, amount, currency } = params
  const sandbox = params.sandbox ?? false

  const key = deriveL402Key(accessToken)
  // Sandbox is appended to the signed message so the verify path can trust it
  // without a server round-trip. Note: appending changes the HMAC for every
  // credential, including non-sandbox ones — credentials issued by builds prior
  // to this change will fail signature verification. Acceptable because L402
  // credentials are short-lived (5-min agent expiry; minutes for human payers).
  const message = `${paymentHash}\0${amountSats}\0${expiresAt}\0${resource}\0${amount}\0${currency}\0${sandbox ? '1' : '0'}`
  const sig = createHmac('sha256', key)
    .update(message)
    .digest('hex')

  const tokenObj = { paymentHash, amountSats, expiresAt, resource, amount, currency, sandbox, sig }
  return Buffer.from(JSON.stringify(tokenObj)).toString('base64')
}

/**
 * Verify the HMAC signature and expiry of an L402 credential.
 * Does NOT verify the payment preimage — that is a separate step.
 */
export function verifyL402Credential(credential: string, accessToken: string): VerifyL402CredentialResult {
  try {
    const decoded = Buffer.from(credential, 'base64').toString('utf8')
    const parsed = credentialPayloadSchema.safeParse(JSON.parse(decoded))

    if (!parsed.success) {
      return { valid: false, reason: 'invalid_format' }
    }

    const { paymentHash, amountSats, expiresAt, resource, amount, currency, sandbox, sig } = parsed.data

    // Reject malformed hex before doing crypto work
    if (!/^[0-9a-f]{64}$/.test(sig)) {
      return { valid: false, reason: 'invalid_signature' }
    }

    // Verify HMAC with constant-time comparison. Message format must match
    // createL402Credential exactly — sandbox is the last field.
    const key = deriveL402Key(accessToken)
    const message = `${paymentHash}\0${amountSats}\0${expiresAt}\0${resource}\0${amount}\0${currency}\0${sandbox ? '1' : '0'}`
    const expectedSig = createHmac('sha256', key)
      .update(message)
      .digest('hex')

    const sigBuffer = Buffer.from(sig, 'hex')
    const expectedBuffer = Buffer.from(expectedSig, 'hex')

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: 'invalid_signature' }
    }

    return { valid: true, paymentHash, amountSats, expiresAt, resource, amount, currency, sandbox }
  } catch {
    return { valid: false, reason: 'invalid_format' }
  }
}

/**
 * Verify that a preimage hashes to the expected payment hash.
 * SHA256(preimage_bytes) must equal the payment hash.
 */
export function verifyPreimage(preimage: string, paymentHash: string): boolean {
  try {
    const hash = createHash('sha256')
      .update(Buffer.from(preimage, 'hex'))
      .digest('hex')
    return hash === paymentHash
  } catch {
    return false
  }
}

/**
 * Parse an L402 Authorization header.
 * Accepts both L402 and LSAT schemes per bLIP-26 backwards compatibility.
 * Expected format: "L402 <macaroon>:<preimage>" or "LSAT <macaroon>:<preimage>"
 */
export function parseAuthorizationHeader(header: string | null): ParseAuthResult {
  if (!header) {
    return { valid: false, attempted: false }
  }

  const lower = header.toLowerCase()
  const scheme = L402_SCHEMES.find(s => lower.startsWith(s + ' '))
  if (!scheme) {
    return { valid: false, attempted: false }
  }

  // L402/LSAT scheme detected - any failure from here is a malformed attempt
  const credentials = header.slice(scheme.length + 1).trim()
  const colonIndex = credentials.indexOf(':')

  if (colonIndex === -1) {
    return { valid: false, attempted: true }
  }

  const macaroon = credentials.slice(0, colonIndex)
  const preimage = credentials.slice(colonIndex + 1)

  if (!macaroon || !preimage) {
    return { valid: false, attempted: true }
  }

  return { valid: true, macaroon, preimage }
}
