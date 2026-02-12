import { createHmac, timingSafeEqual, createHash } from 'crypto'
import { z } from 'zod'

/**
 * Parameters for creating an MDK402 token.
 */
export interface CreateMDK402TokenParams {
  paymentHash: string
  amountSats: number
  expiresAt: number // Unix timestamp in seconds
  accessToken: string
  resource: string // method:pathname identifier (e.g. "GET:/api/premium")
  amount: number // pre-conversion amount from PaymentConfig
  currency: string // currency code (e.g. "SAT", "USD")
}

/**
 * Result of verifying an MDK402 token.
 */
export type VerifyMDK402TokenResult =
  | { valid: true; paymentHash: string; amountSats: number; expiresAt: number; resource: string; amount: number; currency: string }
  | { valid: false; reason: 'invalid_format' | 'invalid_signature' | 'expired' }

/**
 * Result of parsing an Authorization header.
 */
export type ParseAuthResult =
  | { valid: true; token: string; preimage: string }
  | { valid: false }

/** Schema for validating decoded MDK402 token payloads. */
const tokenPayloadSchema = z.object({
  paymentHash: z.string(),
  amountSats: z.number(),
  expiresAt: z.number(),
  resource: z.string(),
  amount: z.number(),
  currency: z.string(),
  sig: z.string(),
})

/** Version tag for HMAC key derivation. Allows future token format changes. */
const KEY_DERIVATION_TAG = 'mdk402-token-v1'

/**
 * Derive a domain-specific HMAC key for MDK402 tokens.
 * Provides separation from checkout URL signing and webhook verification
 * that also use MDK_ACCESS_TOKEN.
 */
export function deriveMDK402Key(accessToken: string): Buffer {
  return createHmac('sha256', accessToken)
    .update(KEY_DERIVATION_TAG)
    .digest()
}

/**
 * Create a signed MDK402 token.
 * Returns a base64-encoded JSON string containing the payment hash,
 * amount, expiry, and an HMAC signature.
 */
export function createMDK402Token(params: CreateMDK402TokenParams): string {
  const { paymentHash, amountSats, expiresAt, accessToken, resource, amount, currency } = params

  const key = deriveMDK402Key(accessToken)
  const message = `${paymentHash}\0${amountSats}\0${expiresAt}\0${resource}\0${amount}\0${currency}`
  const sig = createHmac('sha256', key)
    .update(message)
    .digest('hex')

  const tokenObj = { paymentHash, amountSats, expiresAt, resource, amount, currency, sig }
  return Buffer.from(JSON.stringify(tokenObj)).toString('base64')
}

/**
 * Verify the HMAC signature and expiry of an MDK402 token.
 * Does NOT verify the payment preimage — that is a separate step.
 */
export function verifyMDK402Token(token: string, accessToken: string): VerifyMDK402TokenResult {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const parsed = tokenPayloadSchema.safeParse(JSON.parse(decoded))

    if (!parsed.success) {
      return { valid: false, reason: 'invalid_format' }
    }

    const { paymentHash, amountSats, expiresAt, resource, amount, currency, sig } = parsed.data

    // Check expiry before doing crypto work
    const nowSecs = Math.floor(Date.now() / 1000)
    if (expiresAt < nowSecs) {
      return { valid: false, reason: 'expired' }
    }

    // Reject malformed hex before doing crypto work
    if (!/^[0-9a-f]{64}$/.test(sig)) {
      return { valid: false, reason: 'invalid_signature' }
    }

    // Verify HMAC with constant-time comparison
    const key = deriveMDK402Key(accessToken)
    const message = `${paymentHash}\0${amountSats}\0${expiresAt}\0${resource}\0${amount}\0${currency}`
    const expectedSig = createHmac('sha256', key)
      .update(message)
      .digest('hex')

    const sigBuffer = Buffer.from(sig, 'hex')
    const expectedBuffer = Buffer.from(expectedSig, 'hex')

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: 'invalid_signature' }
    }

    return { valid: true, paymentHash, amountSats, expiresAt, resource, amount, currency }
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
 * Parse an MDK402 Authorization header.
 * Expected format: "MDK402 <token>:<preimage>"
 */
export function parseAuthorizationHeader(header: string | null): ParseAuthResult {
  if (!header) {
    return { valid: false }
  }

  if (!header.toLowerCase().startsWith('mdk402 ')) {
    return { valid: false }
  }

  const credentials = header.slice(7).trim()
  const colonIndex = credentials.indexOf(':')

  if (colonIndex === -1) {
    return { valid: false }
  }

  const token = credentials.slice(0, colonIndex)
  const preimage = credentials.slice(colonIndex + 1)

  if (!token || !preimage) {
    return { valid: false }
  }

  return { valid: true, token, preimage }
}
