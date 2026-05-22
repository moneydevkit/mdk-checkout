import { createHash } from 'node:crypto'

import { decodeBolt11AmountSats } from './bolt11'
import { programmaticPayout, waitForPayoutResult } from './server'

/**
 * Options for {@link pay402}.
 */
export type Pay402Options = {
  /**
   * Reject the call without paying when the L402 invoice amount exceeds this
   * cap (in sats). Recommended for defence against a compromised or buggy
   * L402 server. When omitted, the SDK will pay any amount the server asks
   * for - use with caution on untrusted servers.
   */
  maxAmountSats?: number
  /**
   * Extra fetch options forwarded to BOTH fetches (the initial 402-triggering
   * request and the retry with the L402 Authorization header). Custom
   * method, body, headers, signal, etc. are preserved across both calls.
   * The Authorization header is set on the retry; if `fetchInit.headers`
   * already supplies one it is overridden.
   */
  fetchInit?: RequestInit
  /**
   * Idempotency key forwarded to programmaticPayout. When omitted the SDK
   * derives a stable key from `sha256(url + ':' + macaroon)` so retries of
   * the same logical request dedupe at mdk.com.
   */
  idempotencyKey?: string
  /**
   * Total wait budget passed to waitForPayoutResult. Defaults to 30s. Beyond
   * 25s the SDK loops the underlying RPC server-side.
   */
  timeoutMs?: number
}

/**
 * Distinguishable error class for pay402 failures. The `code` field
 * categorizes the failure so callers can branch without parsing messages.
 */
export class Pay402Error extends Error {
  constructor(
    public readonly code: Pay402ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'Pay402Error'
  }
}

/** Documented error codes thrown by {@link pay402}. */
export type Pay402ErrorCode =
  | 'not_l402'
  | 'amount_unknown'
  | 'amount_exceeds_max'
  | 'payout_failed'
  | 'payout_timeout'
  | 'l402_redeem_failed'

const DEFAULT_TIMEOUT_MS = 30_000

type ParsedChallenge = {
  macaroon: string
  invoice: string
}

/**
 * Parse a `WWW-Authenticate` header value of the form
 *   L402 macaroon="...", invoice="..."
 * and return both values. Both must be present and non-empty; anything else
 * is treated as a non-L402 challenge and rejected.
 *
 * RFC 2617 quoted-string parsing is intentionally lenient on whitespace and
 * quote style (single OR double) to interop with hand-rolled L402 servers.
 * Backslash escapes inside the quoted value are unescaped.
 */
function parseL402Challenge(headerValue: string): ParsedChallenge | null {
  if (!headerValue) return null
  const trimmed = headerValue.trim()
  // Must start with the L402 scheme token followed by whitespace.
  if (!/^L402(\s|$)/i.test(trimmed)) return null
  const rest = trimmed.slice('L402'.length).trim()

  const grab = (key: string): string | undefined => {
    // Match `<key>=<quoted-or-bare-value>`. Quoted values can contain commas
    // and equals signs; bare values (rare in L402 but allowed) cannot.
    const re = new RegExp(
      `\\b${key}\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|([^,\\s]+))`,
      'i',
    )
    const m = rest.match(re)
    if (!m) return undefined
    const raw = m[1] ?? m[2] ?? m[3]
    if (raw === undefined) return undefined
    // Unescape backslash sequences inside quoted strings.
    return raw.replace(/\\(.)/g, '$1')
  }

  const macaroon = grab('macaroon')
  const invoice = grab('invoice')
  if (!macaroon || !invoice) return null
  return { macaroon, invoice }
}

/**
 * Pay an L402-protected URL.
 *
 * Flow:
 *   1. Fetch the URL. If the response is not 402 with an L402 challenge,
 *      throw `Pay402Error('not_l402')`.
 *   2. Parse macaroon + BOLT11 invoice from the WWW-Authenticate header.
 *   3. Decode the invoice amount. If the invoice is amountless (server bug
 *      for an L402 flow) or sub-sat, throw `amount_unknown`. If
 *      `maxAmountSats` is set and the invoice asks for more, throw
 *      `amount_exceeds_max` WITHOUT dispatching the payment.
 *   4. Dispatch the payment via programmaticPayout, derive a default
 *      idempotencyKey from `sha256(url + ':' + macaroon)` if not provided.
 *   5. Block on waitForPayoutResult until the terminal preimage arrives.
 *      On FAILED, throw `payout_failed` with the underlying reason. On
 *      timeout, throw `payout_timeout` (a subsequent pay402 call with the
 *      same URL+macaroon will reuse the same idempotency key and resume).
 *   6. Re-fetch the URL with `Authorization: L402 <macaroon>:<preimage>`.
 *      If the server still returns 402, throw `l402_redeem_failed`.
 *
 * The successful Response is returned RAW so the caller decides how to
 * consume it (json / text / arrayBuffer / streamed).
 *
 * Server-only: uses programmaticPayout under the hood which guards against
 * browser invocation.
 */
export async function pay402(
  url: string,
  opts: Pay402Options = {},
): Promise<Response> {
  const fetchInit = opts.fetchInit
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // Step 1 + 2: trigger the challenge.
  const initial = await fetch(url, fetchInit)
  if (initial.status !== 402) {
    throw new Pay402Error(
      'not_l402',
      `Expected HTTP 402 from ${url}; got ${initial.status}.`,
    )
  }
  const wwwAuthenticate = initial.headers.get('www-authenticate') ?? ''
  const challenge = parseL402Challenge(wwwAuthenticate)
  if (!challenge) {
    throw new Pay402Error(
      'not_l402',
      `WWW-Authenticate header at ${url} is not a recognized L402 challenge.`,
    )
  }
  // Drain the initial 402 body so the underlying socket can be reused. We
  // ignore content but await it to avoid leaking the response into a "lock"
  // state on some fetch implementations.
  try {
    await initial.arrayBuffer()
  } catch {
    /* ignore - some servers send no body */
  }

  // Step 3: amount checks BEFORE we touch the SDK or the wire.
  const amountSats = decodeBolt11AmountSats(challenge.invoice)
  if (amountSats === null) {
    throw new Pay402Error(
      'amount_unknown',
      `L402 invoice from ${url} has no decodable amount; the server should mint a fixed-amount BOLT11 invoice.`,
    )
  }
  if (opts.maxAmountSats != null && amountSats > opts.maxAmountSats) {
    throw new Pay402Error(
      'amount_exceeds_max',
      `L402 invoice from ${url} requests ${amountSats} sats which exceeds the maxAmountSats cap of ${opts.maxAmountSats}.`,
    )
  }

  // Step 4: dispatch the payment.
  const idempotencyKey =
    opts.idempotencyKey ??
    createHash('sha256').update(`${url}:${challenge.macaroon}`).digest('hex')
  const dispatch = await programmaticPayout({
    destination: challenge.invoice,
    idempotencyKey,
  })
  if (dispatch.error) {
    throw new Pay402Error(
      'payout_failed',
      `programmaticPayout failed for ${url}: ${dispatch.error.message}`,
      dispatch.error,
    )
  }

  // Step 5: wait for the terminal outcome and harvest the preimage.
  const waited = await waitForPayoutResult({
    idempotencyKey,
    timeoutMs,
  })
  if (waited.error) {
    throw new Pay402Error(
      'payout_failed',
      `waitForPayoutResult failed for ${url}: ${waited.error.message}`,
      waited.error,
    )
  }
  const outcome = waited.data
  if (outcome.status === 'FAILED') {
    throw new Pay402Error(
      'payout_failed',
      `Payout to ${url} failed: ${outcome.failureReason ?? 'unknown reason'}.`,
    )
  }
  if (outcome.status !== 'SUCCESS' || !outcome.preimage) {
    throw new Pay402Error(
      'payout_timeout',
      `Payout to ${url} did not settle within ${timeoutMs}ms. Retry with the same idempotencyKey to resume the wait.`,
    )
  }
  const preimage = outcome.preimage

  // Step 6: redeem the L402 token by replaying the request with the
  // Authorization header. We rebuild headers from fetchInit to preserve
  // anything the caller set (content-type, custom auth, accept, etc.) and
  // overwrite Authorization with the L402 token.
  const replayHeaders = new Headers(fetchInit?.headers ?? undefined)
  replayHeaders.set('authorization', `L402 ${challenge.macaroon}:${preimage}`)
  const replay = await fetch(url, { ...fetchInit, headers: replayHeaders })
  if (replay.status === 402) {
    // We paid and got a preimage, but the server still rejected. Either the
    // macaroon was revoked, the preimage doesn't match the macaroon's
    // payment-hash caveat, or there's a server-side bug. Either way, the
    // caller can't recover automatically.
    throw new Pay402Error(
      'l402_redeem_failed',
      `Server at ${url} returned 402 again after the L402 Authorization header was attached. The preimage may not match the macaroon's payment_hash caveat.`,
    )
  }
  return replay
}
