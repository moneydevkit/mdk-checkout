/**
 * Main payout function for @moneydevkit/payouts
 *
 * Provides secure programmatic Lightning payouts.
 * Authorization is handled by moneydevkit.com, execution is local.
 */

import { createMoneyDevKitNode } from '@moneydevkit/core'

import { assertServerOnly } from './server-only'
import { parseDestination, validateDestinationAllowlist } from './destination'
import {
  getCachedResult,
  markInProgress,
  clearInProgress,
  cacheResult,
} from './idempotency'
import {
  authorizePayout,
  completePayout,
} from './payout-client'
import {
  PayoutException,
  InvalidAmountError,
  AbortedByCallbackError,
  CallbackTimeoutError,
  PaymentFailedError,
  InternalError,
  PerPaymentLimitExceededError,
  HourlyLimitExceededError,
  DailyLimitExceededError,
  RateLimitExceededError,
} from './errors'
import type {
  PayoutOptions,
  PayoutResult,
  PayoutPreview,
  PayoutCurrency,
} from './types'

/**
 * Timeout for beforePayout callback (5 seconds)
 */
const CALLBACK_TIMEOUT_MS = 5000

/**
 * Converts amount to sats based on currency
 * In production, non-sat currencies would be converted via moneydevkit.com API
 */
function convertToSats(amount: number, currency: PayoutCurrency): number {
  switch (currency) {
    case 'sats':
      return Math.floor(amount)

    case 'btc':
      // 1 BTC = 100,000,000 sats
      return Math.floor(amount * 100_000_000)

    case 'usd':
    case 'eur':
      // TODO: In production, fetch current exchange rate from moneydevkit.com
      // For now, use a placeholder conversion (this will be implemented server-side)
      // Assuming roughly $0.001 per sat (100k sats = $100 at ~$100k/BTC)
      const satsPerUsd = 1000 // Placeholder - should be fetched from API
      return Math.floor(amount * satsPerUsd)

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = currency
      throw new InvalidAmountError(`Unsupported currency: ${_exhaustive}`)
  }
}

/**
 * Validates payout options
 */
function validateOptions(options: PayoutOptions): void {
  if (!options.idempotencyKey || options.idempotencyKey.trim() === '') {
    throw new InvalidAmountError('idempotencyKey is required')
  }

  if (typeof options.amount !== 'number' || isNaN(options.amount)) {
    throw new InvalidAmountError('amount must be a valid number')
  }

  if (options.amount <= 0) {
    throw new InvalidAmountError('amount must be positive')
  }
}

/**
 * Runs beforePayout callback with timeout
 */
async function runBeforePayoutCallback(
  callback: NonNullable<PayoutOptions['beforePayout']>,
  preview: PayoutPreview,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new CallbackTimeoutError(CALLBACK_TIMEOUT_MS))
    }, CALLBACK_TIMEOUT_MS)

    Promise.resolve(callback(preview))
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

/**
 * Maps server error codes to exception types
 */
function throwServerError(
  errorCode: string,
  errorMessage: string,
  retryAfterMs?: number,
): never {
  switch (errorCode) {
    case 'PER_PAYMENT_LIMIT_EXCEEDED':
      throw new PerPaymentLimitExceededError(0, 0) // Server doesn't send details
    case 'HOURLY_LIMIT_EXCEEDED':
      throw new HourlyLimitExceededError(0, 0, retryAfterMs ?? 3600000)
    case 'DAILY_LIMIT_EXCEEDED':
      throw new DailyLimitExceededError(0, 0, retryAfterMs ?? 86400000)
    case 'RATE_LIMIT_EXCEEDED':
      throw new RateLimitExceededError(0, 0, retryAfterMs ?? 60000)
    default:
      throw new InternalError(errorMessage || 'Authorization failed')
  }
}

/**
 * Performs a Lightning payout.
 *
 * Authorization is handled by moneydevkit.com (validates secret, enforces limits).
 * Payment execution happens locally via the Lightning node.
 *
 * @param options - Payout options including destination, amount, and idempotency key
 * @returns PayoutResult with success status and payment details
 *
 * @example
 * ```ts
 * import { payout } from '@moneydevkit/payouts'
 *
 * const result = await payout({
 *   destination: 'winner@wallet.com',
 *   amount: 1000,
 *   currency: 'sats',
 *   idempotencyKey: 'game-123-win',
 * })
 *
 * if (result.success) {
 *   console.log('Paid:', result.paymentId)
 * } else {
 *   console.error('Failed:', result.error?.message)
 * }
 * ```
 */
export async function payout(options: PayoutOptions): Promise<PayoutResult> {
  // Layer 0: Server-only enforcement
  assertServerOnly()

  // Validate options early
  validateOptions(options)

  const { destination, amount, currency = 'sats', idempotencyKey } = options

  // Check for cached result (idempotency - local cache)
  const cachedResult = getCachedResult(idempotencyKey)
  if (cachedResult) {
    return cachedResult
  }

  // Mark as in progress (prevents concurrent duplicate requests locally)
  if (!markInProgress(idempotencyKey)) {
    // Another request with same key is in progress, wait and return cached result
    await new Promise((resolve) => setTimeout(resolve, 100))
    const result = getCachedResult(idempotencyKey)
    if (result) {
      return result
    }
    // Still no result, let this request proceed
  }

  let authorizationId: string | undefined

  try {
    // Parse and validate destination
    const parsedDestination = parseDestination(destination)

    // Validate against local allowlist (optional additional layer)
    validateDestinationAllowlist(parsedDestination)

    // Convert amount to sats
    const amountSats = convertToSats(amount, currency)

    if (amountSats <= 0) {
      throw new InvalidAmountError('Amount converts to 0 sats')
    }

    // ===== AUTHORIZE VIA MONEYDEVKIT.COM =====
    // This is the primary security layer - validates secret and enforces limits
    const authResponse = await authorizePayout({
      amountSats,
      idempotencyKey,
      destination: parsedDestination.address,
    })

    if (!authResponse.authorized) {
      throwServerError(
        authResponse.errorCode ?? 'UNKNOWN',
        authResponse.errorMessage ?? 'Authorization denied',
        authResponse.retryAfterMs,
      )
    }

    authorizationId = authResponse.authorizationId

    // Create preview for callback
    const preview: PayoutPreview = {
      destinationType: parsedDestination.type,
      destination: parsedDestination.address,
      amountSats,
      originalAmount: amount,
      originalCurrency: currency,
      idempotencyKey,
    }

    // Run beforePayout callback if provided (Layer 6)
    if (options.beforePayout) {
      const shouldProceed = await runBeforePayoutCallback(
        options.beforePayout,
        preview,
      )

      if (!shouldProceed) {
        // Report cancellation to server
        if (authorizationId) {
          await completePayout({
            authorizationId,
            success: false,
            errorMessage: 'Aborted by beforePayout callback',
          }).catch(() => {}) // Don't fail on reporting error
        }
        throw new AbortedByCallbackError()
      }
    }

    // ===== EXECUTE PAYMENT LOCALLY =====
    let paymentId: string

    try {
      const node = createMoneyDevKitNode()
      const amountMsat = amountSats * 1000

      switch (parsedDestination.type) {
        case 'bolt12':
          paymentId = node.payBolt12Offer(parsedDestination.address, amountMsat)
          break

        case 'bolt11':
          // BOLT11 has fixed amount, ignore our amountSats
          paymentId = node.payBolt11(parsedDestination.address)
          break

        case 'lnurl':
        case 'lightning_address':
          node.payLNUrl(parsedDestination.address, amountMsat)
          paymentId = `lnurl-${Date.now()}` // LNURL doesn't return payment ID directly
          break

        default:
          // TypeScript exhaustiveness check
          const _exhaustive: never = parsedDestination.type
          throw new InternalError(`Unknown destination type: ${_exhaustive}`)
      }
    } catch (error) {
      // Report failure to server
      if (authorizationId) {
        await completePayout({
          authorizationId,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Payment failed',
        }).catch(() => {}) // Don't fail on reporting error
      }

      if (error instanceof PayoutException) {
        throw error
      }

      throw new PaymentFailedError(
        error instanceof Error ? error.message : 'Payment failed',
      )
    }

    // ===== REPORT SUCCESS TO MONEYDEVKIT.COM =====
    if (authorizationId) {
      await completePayout({
        authorizationId,
        success: true,
        paymentId,
      }).catch(() => {}) // Don't fail on reporting error
    }

    const result: PayoutResult = {
      success: true,
      paymentId,
      amountSats,
    }

    // Cache the result locally
    cacheResult(idempotencyKey, result)

    // Run afterPayout callback if provided
    if (options.afterPayout) {
      try {
        await options.afterPayout(result)
      } catch {
        // Don't fail the payment if afterPayout fails
        // The payment was already successful
      }
    }

    return result
  } catch (error) {
    // Build error result
    const errorResult: PayoutResult = {
      success: false,
      error:
        error instanceof PayoutException
          ? error.toPayoutError()
          : {
              code: 'INTERNAL_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
    }

    // Cache error results too (for idempotency)
    cacheResult(idempotencyKey, errorResult)

    // Run afterPayout callback with error result
    if (options.afterPayout) {
      try {
        await options.afterPayout(errorResult)
      } catch {
        // Ignore callback errors
      }
    }

    return errorResult
  } finally {
    clearInProgress(idempotencyKey)
  }
}
