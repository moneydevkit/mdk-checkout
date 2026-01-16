/**
 * Client for payout authorization via moneydevkit.com
 *
 * This client handles authentication and limit enforcement through
 * moneydevkit.com's server-side API. The actual payment execution
 * happens locally via the Lightning node.
 */

import {
  MAINNET_MDK_BASE_URL,
  SIGNET_MDK_BASE_URL,
} from '@moneydevkit/core'

import { InvalidSecretError, InternalError } from './errors'
import type { PayoutLimits } from './types'

/**
 * Request to authorize a payout
 */
export interface AuthorizePayoutRequest {
  /**
   * Amount in sats to authorize
   */
  amountSats: number

  /**
   * Idempotency key for this payout
   */
  idempotencyKey: string

  /**
   * Destination (for logging/analytics, not validation)
   */
  destination?: string
}

/**
 * Response from payout authorization
 */
export interface AuthorizePayoutResponse {
  /**
   * Whether the payout is authorized
   */
  authorized: boolean

  /**
   * Authorization ID to include with payment completion
   */
  authorizationId?: string

  /**
   * Error code if not authorized
   */
  errorCode?: string

  /**
   * Error message if not authorized
   */
  errorMessage?: string

  /**
   * Retry-after in ms for rate limit errors
   */
  retryAfterMs?: number

  /**
   * Current limit status
   */
  limits?: {
    hourlyUsed: number
    hourlyLimit: number
    dailyUsed: number
    dailyLimit: number
  }
}

/**
 * Request to complete a payout (after payment succeeds)
 */
export interface CompletePayoutRequest {
  /**
   * Authorization ID from authorize response
   */
  authorizationId: string

  /**
   * Whether the payment succeeded
   */
  success: boolean

  /**
   * Payment ID if successful
   */
  paymentId?: string

  /**
   * Error message if failed
   */
  errorMessage?: string
}

/**
 * Cached config
 */
let cachedConfig: { secret: string; baseUrl: string } | null = null

/**
 * Gets the payout secret from environment
 */
function getPayoutSecret(): string {
  const secret = process.env.MDK_PAYOUT_SECRET

  if (!secret) {
    throw new InvalidSecretError(
      'MDK_PAYOUT_SECRET environment variable is required.',
    )
  }

  return secret
}

/**
 * Gets the base URL for payout API
 */
function getBaseUrl(): string {
  const network = process.env.MDK_NETWORK ?? 'mainnet'
  const customUrl = process.env.MDK_API_BASE_URL

  if (customUrl) {
    return customUrl
  }

  return network === 'signet' ? SIGNET_MDK_BASE_URL : MAINNET_MDK_BASE_URL
}

/**
 * Makes authenticated request to payout API
 */
async function payoutApiRequest<T>(
  endpoint: string,
  body: unknown,
): Promise<T> {
  if (!cachedConfig) {
    cachedConfig = {
      secret: getPayoutSecret(),
      baseUrl: getBaseUrl(),
    }
  }

  // Replace /rpc suffix with /payout for payout endpoints
  const baseUrl = cachedConfig.baseUrl.replace(/\/rpc$/, '')
  const url = `${baseUrl}/payout${endpoint}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-payout-secret': cachedConfig.secret,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new InvalidSecretError('Invalid MDK_PAYOUT_SECRET')
    }

    const text = await response.text()
    throw new InternalError(`Payout API error: ${response.status} ${text}`)
  }

  return response.json()
}

/**
 * Authorizes a payout through moneydevkit.com
 *
 * This validates the payout secret and enforces spending limits
 * atomically on the server side.
 *
 * @param request - Authorization request
 * @returns Authorization response
 */
export async function authorizePayout(
  request: AuthorizePayoutRequest,
): Promise<AuthorizePayoutResponse> {
  return payoutApiRequest<AuthorizePayoutResponse>('/authorize', request)
}

/**
 * Reports payout completion to moneydevkit.com
 *
 * Call this after the payment succeeds or fails to update
 * server-side tracking.
 *
 * @param request - Completion request
 */
export async function completePayout(
  request: CompletePayoutRequest,
): Promise<void> {
  await payoutApiRequest<{ ok: boolean }>('/complete', request)
}

/**
 * Gets current payout limits and usage from moneydevkit.com
 */
export async function getPayoutLimitsFromServer(): Promise<{
  limits: PayoutLimits
  usage: {
    hourlyUsed: number
    dailyUsed: number
  }
}> {
  return payoutApiRequest('/limits', {})
}

/**
 * Resets cached config (for testing)
 */
export function __resetPayoutClientCache(): void {
  cachedConfig = null
}
