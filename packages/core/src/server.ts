import { ORPCError } from '@orpc/client'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import {
  contract,
  type GetBalanceResult,
  type ProgrammaticPayoutResult,
} from '@moneydevkit/api-contract'

import { MAINNET_MDK_BASE_URL } from './mdk-config'
import { failure, success, type MdkError, type Result } from './types'

/**
 * Options accepted by the server-only programmatic payout helper.
 */
export type ProgrammaticPayoutOptions = {
  /** Amount to send, in sats. */
  amountSats: number
  /** Lightning destination to pay from this server-side request. */
  destination: string
  /**
   * Idempotency key used to deduplicate retries of the same logical payout.
   * Pass the same value on retry to avoid double-pays. Typically your own
   * orderId / withdrawalId / requestId. Must be a stable string per logical
   * payout, not a fresh value generated on each call.
   */
  idempotencyKey: string
}

/**
 * Errors the SDK classifies as definitely-retryable. The same call with the
 * same idempotency key can safely be sent again; mdk.com will dedupe.
 */
const RETRYABLE_CODES = new Set([
  'PROGRAMMATIC_PAYOUT_FAILED',
  'PROGRAMMATIC_PAYOUT_DAILY_LIMIT_EXCEEDED',
])

/**
 * Errors the SDK classifies as not retryable without changing inputs or config.
 */
const NON_RETRYABLE_CODES = new Set([
  'PROGRAMMATIC_PAYOUT_APP_KEY_REQUIRED',
  'PROGRAMMATIC_PAYOUTS_DISABLED',
  'PROGRAMMATIC_PAYOUT_TOO_LARGE',
  'INVALID_PROGRAMMATIC_PAYOUT_AMOUNT',
  'VALIDATION_ERROR',
  'NOT_FOUND',
])

/**
 * Map a backend error code to a short, actionable reason string the caller
 * can branch on. Returns undefined for unrecognized codes.
 */
function reasonForCode(code: string | undefined): string | undefined {
  if (!code) return undefined
  switch (code) {
    case 'PROGRAMMATIC_PAYOUT_DAILY_LIMIT_EXCEEDED':
      return 'daily_limit_exceeded'
    case 'PROGRAMMATIC_PAYOUT_TOO_LARGE':
      return 'amount_too_large'
    case 'PROGRAMMATIC_PAYOUTS_DISABLED':
      return 'programmatic_payouts_disabled'
    case 'PROGRAMMATIC_PAYOUT_APP_KEY_REQUIRED':
      return 'app_scoped_api_key_required'
    case 'PROGRAMMATIC_PAYOUT_FAILED':
      return 'payout_dispatch_failed'
    case 'INVALID_PROGRAMMATIC_PAYOUT_AMOUNT':
      return 'amount_invalid'
    default:
      return undefined
  }
}

function classifyOrpcError(err: ORPCError<string, unknown>): MdkError {
  const data = err.data as { code?: string } | undefined
  const code = data?.code
  const retryable = code
    ? RETRYABLE_CODES.has(code)
      ? true
      : NON_RETRYABLE_CODES.has(code)
        ? false
        : undefined
    : undefined
  return {
    code: code ?? err.code ?? 'payout_failed',
    message: err.message,
    status: err.status,
    retryable,
    reason: reasonForCode(code),
  }
}

/**
 * Trigger a payout from a server function through mdk.com's control plane.
 *
 * This helper accepts a destination because it is intended for trusted server
 * functions. Never expose it through a client-controlled route without your
 * own authorization and business rules.
 *
 * The returned result distinguishes retryable failures (e.g. transient
 * dispatch failures, daily limit) from terminal ones (e.g. app config, validation).
 * Use `result.error.retryable` and `result.error.reason` to drive retries.
 */
export async function programmaticPayout(
  options: ProgrammaticPayoutOptions,
): Promise<Result<ProgrammaticPayoutResult>> {
  if (typeof window !== 'undefined') {
    return failure({
      code: 'server_only',
      message: 'programmaticPayout() can only be called from a server function.',
      retryable: false,
    })
  }

  if (!Number.isInteger(options.amountSats) || options.amountSats <= 0) {
    return failure({
      code: 'invalid_amount',
      message: 'Enter a positive whole-sat amount before triggering a payout.',
      retryable: false,
    })
  }
  const destination = options.destination.trim()
  if (!destination || destination.length > 4096) {
    return failure({
      code: 'invalid_destination',
      message: 'Enter a valid Lightning destination before triggering a payout.',
      retryable: false,
    })
  }
  if (/[\u0000-\u001f\u007f]/.test(destination)) {
    return failure({
      code: 'invalid_destination',
      message: 'Enter a valid Lightning destination before triggering a payout.',
      retryable: false,
    })
  }
  if (typeof options.idempotencyKey !== 'string' || options.idempotencyKey.length === 0) {
    return failure({
      code: 'invalid_idempotency_key',
      message:
        'Pass a stable idempotencyKey (e.g. your orderId) so retries do not double-pay.',
      retryable: false,
    })
  }

  const accessToken = process.env.MDK_ACCESS_TOKEN
  if (!accessToken) {
    return failure({
      code: 'missing_access_token',
      message: 'Set MDK_ACCESS_TOKEN in your environment before triggering a payout.',
      retryable: false,
    })
  }
  const baseUrl = process.env.MDK_API_BASE_URL ?? MAINNET_MDK_BASE_URL

  try {
    const link = new RPCLink({
      url: baseUrl,
      headers: () => ({
        'x-api-key': accessToken,
      }),
    })
    const client: ContractRouterClient<typeof contract> = createORPCClient(link)
    const result = await client.checkout.programmaticPayout({
      amountSats: options.amountSats,
      destination,
      idempotencyKey: options.idempotencyKey,
    })
    return success(result)
  } catch (err) {
    if (err instanceof ORPCError) {
      return failure(classifyOrpcError(err))
    }
    return failure({
      code: 'payout_failed',
      message: err instanceof Error ? err.message : String(err),
      retryable: true,
    })
  }
}

/**
 * Read the spendable balance of the merchant node tied to this server's
 * MDK_ACCESS_TOKEN. Idempotent and safe to retry. Requires an app-scoped key:
 * legacy org-level keys cannot read balance because an org can own multiple
 * apps and balance is meaningless without an app.
 *
 * Routes through mdk.com over HTTPS oRPC; mdk.com fans out to the merchant's
 * running node via the same WS control plane used by programmaticPayout.
 */
export async function getBalance(): Promise<Result<GetBalanceResult>> {
  if (typeof window !== 'undefined') {
    return failure({
      code: 'server_only',
      message: 'getBalance() can only be called from a server function.',
      retryable: false,
    })
  }

  const accessToken = process.env.MDK_ACCESS_TOKEN
  if (!accessToken) {
    return failure({
      code: 'missing_access_token',
      message: 'Set MDK_ACCESS_TOKEN in your environment before reading balance.',
      retryable: false,
    })
  }
  const baseUrl = process.env.MDK_API_BASE_URL ?? MAINNET_MDK_BASE_URL

  try {
    const link = new RPCLink({
      url: baseUrl,
      headers: () => ({
        'x-api-key': accessToken,
      }),
    })
    const client: ContractRouterClient<typeof contract> = createORPCClient(link)
    const result = await client.checkout.getBalance()
    return success(result)
  } catch (err) {
    if (err instanceof ORPCError) {
      const data = err.data as { code?: string } | undefined
      const code = data?.code ?? err.code ?? 'get_balance_failed'
      // Balance is an idempotent read; transient WS / spin-up failures can be
      // retried safely. Terminal failures: auth (invalid / missing API key),
      // app-scope (legacy org-level key), and routing (procedure not found -
      // hits when mdk.com is older than this SDK or the merchant SDK is
      // pre-0.1.30 and doesn't implement getBalance over WS). Retrying any
      // of these just burns requests and hides the upgrade / config action
      // from the caller.
      const isAuthError =
        err.code === 'UNAUTHORIZED' ||
        err.code === 'FORBIDDEN' ||
        err.status === 401 ||
        err.status === 403
      const isNotFound = err.code === 'NOT_FOUND' || err.status === 404
      const isBadRequest = err.code === 'BAD_REQUEST' || err.status === 400
      const retryable =
        code === 'GET_BALANCE_APP_KEY_REQUIRED' ||
        isAuthError ||
        isNotFound ||
        isBadRequest
          ? false
          : true
      return failure({
        code,
        message: err.message,
        status: err.status,
        retryable,
      })
    }
    return failure({
      code: 'get_balance_failed',
      message: err instanceof Error ? err.message : String(err),
      retryable: true,
    })
  }
}
