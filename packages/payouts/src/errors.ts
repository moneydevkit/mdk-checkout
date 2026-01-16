/**
 * Error classes for @moneydevkit/payouts
 */

import type { PayoutError, PayoutErrorCode } from './types'

/**
 * Base error class for payout errors
 */
export class PayoutException extends Error {
  public readonly code: PayoutErrorCode
  public readonly retryAfterMs?: number

  constructor(code: PayoutErrorCode, message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'PayoutException'
    this.code = code
    this.retryAfterMs = retryAfterMs
  }

  toPayoutError(): PayoutError {
    return {
      code: this.code,
      message: this.message,
      retryAfterMs: this.retryAfterMs,
    }
  }
}

/**
 * Thrown when payout is attempted from browser context
 */
export class BrowserNotAllowedError extends PayoutException {
  constructor() {
    super(
      'BROWSER_NOT_ALLOWED',
      'Cannot use @moneydevkit/payouts in browser. This package is server-only.',
    )
    this.name = 'BrowserNotAllowedError'
  }
}

/**
 * Thrown when MDK_PAYOUT_SECRET is invalid or missing
 */
export class InvalidSecretError extends PayoutException {
  constructor(message: string) {
    super('INVALID_SECRET', message)
    this.name = 'InvalidSecretError'
  }
}

/**
 * Thrown when secret appears to be exposed (e.g., NEXT_PUBLIC_ prefix)
 */
export class SecretExposedError extends PayoutException {
  constructor(message: string) {
    super('SECRET_EXPOSED', message)
    this.name = 'SecretExposedError'
  }
}

/**
 * Thrown when destination format is invalid
 */
export class InvalidDestinationError extends PayoutException {
  constructor(message: string) {
    super('INVALID_DESTINATION', message)
    this.name = 'InvalidDestinationError'
  }
}

/**
 * Thrown when amount is invalid (negative, zero, etc.)
 */
export class InvalidAmountError extends PayoutException {
  constructor(message: string) {
    super('INVALID_AMOUNT', message)
    this.name = 'InvalidAmountError'
  }
}

/**
 * Thrown when per-payment limit is exceeded
 */
export class PerPaymentLimitExceededError extends PayoutException {
  public readonly limit: number
  public readonly requested: number

  constructor(limit: number, requested: number) {
    super(
      'PER_PAYMENT_LIMIT_EXCEEDED',
      `Payment of ${requested} sats exceeds per-payment limit of ${limit} sats`,
    )
    this.name = 'PerPaymentLimitExceededError'
    this.limit = limit
    this.requested = requested
  }
}

/**
 * Thrown when hourly spending limit is exceeded
 */
export class HourlyLimitExceededError extends PayoutException {
  public readonly limit: number
  public readonly currentUsage: number

  constructor(limit: number, currentUsage: number, retryAfterMs: number) {
    super(
      'HOURLY_LIMIT_EXCEEDED',
      `Hourly spending limit of ${limit} sats exceeded. Current usage: ${currentUsage} sats.`,
      retryAfterMs,
    )
    this.name = 'HourlyLimitExceededError'
    this.limit = limit
    this.currentUsage = currentUsage
  }
}

/**
 * Thrown when daily spending limit is exceeded
 */
export class DailyLimitExceededError extends PayoutException {
  public readonly limit: number
  public readonly currentUsage: number

  constructor(limit: number, currentUsage: number, retryAfterMs: number) {
    super(
      'DAILY_LIMIT_EXCEEDED',
      `Daily spending limit of ${limit} sats exceeded. Current usage: ${currentUsage} sats.`,
      retryAfterMs,
    )
    this.name = 'DailyLimitExceededError'
    this.limit = limit
    this.currentUsage = currentUsage
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class RateLimitExceededError extends PayoutException {
  public readonly limit: number
  public readonly windowMs: number

  constructor(limit: number, windowMs: number, retryAfterMs: number) {
    super(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit of ${limit} payments per ${windowMs / 1000}s exceeded.`,
      retryAfterMs,
    )
    this.name = 'RateLimitExceededError'
    this.limit = limit
    this.windowMs = windowMs
  }
}

/**
 * Thrown when wallet balance is insufficient
 */
export class InsufficientBalanceError extends PayoutException {
  public readonly available: number
  public readonly required: number

  constructor(available: number, required: number) {
    super(
      'INSUFFICIENT_BALANCE',
      `Insufficient balance. Available: ${available} sats, required: ${required} sats.`,
    )
    this.name = 'InsufficientBalanceError'
    this.available = available
    this.required = required
  }
}

/**
 * Thrown when destination is not in allowlist
 */
export class DestinationNotAllowedError extends PayoutException {
  constructor(destination: string) {
    super(
      'DESTINATION_NOT_ALLOWED',
      `Destination not in allowlist: ${destination}`,
    )
    this.name = 'DestinationNotAllowedError'
  }
}

/**
 * Thrown when resolved invoice amount doesn't match requested amount
 */
export class InvoiceAmountMismatchError extends PayoutException {
  public readonly requested: number
  public readonly invoiceAmount: number

  constructor(requested: number, invoiceAmount: number) {
    super(
      'INVOICE_AMOUNT_MISMATCH',
      `Invoice amount (${invoiceAmount} sats) exceeds requested amount (${requested} sats)`,
    )
    this.name = 'InvoiceAmountMismatchError'
    this.requested = requested
    this.invoiceAmount = invoiceAmount
  }
}

/**
 * Thrown when the Lightning payment itself fails
 */
export class PaymentFailedError extends PayoutException {
  constructor(message: string) {
    super('PAYMENT_FAILED', message)
    this.name = 'PaymentFailedError'
  }
}

/**
 * Thrown when beforePayout callback returns false
 */
export class AbortedByCallbackError extends PayoutException {
  constructor() {
    super('ABORTED_BY_CALLBACK', 'Payment aborted by beforePayout callback')
    this.name = 'AbortedByCallbackError'
  }
}

/**
 * Thrown when beforePayout callback times out
 */
export class CallbackTimeoutError extends PayoutException {
  constructor(timeoutMs: number) {
    super('CALLBACK_TIMEOUT', `beforePayout callback timed out after ${timeoutMs}ms`)
    this.name = 'CallbackTimeoutError'
  }
}

/**
 * Thrown for unexpected internal errors
 */
export class InternalError extends PayoutException {
  constructor(message: string) {
    super('INTERNAL_ERROR', message)
    this.name = 'InternalError'
  }
}
