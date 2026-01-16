/**
 * @moneydevkit/payouts - Secure programmatic Lightning payouts
 *
 * This package provides secure server-side functions for making Lightning
 * payments programmatically. Authorization and limit enforcement is handled
 * by moneydevkit.com, while payment execution happens locally.
 *
 * @example
 * ```ts
 * import { payout, getBalance } from '@moneydevkit/payouts'
 *
 * // Check balance
 * const balance = await getBalance()
 * console.log(`Balance: ${balance.sats} sats`)
 *
 * // Make a payout
 * const result = await payout({
 *   destination: 'winner@wallet.com',
 *   amount: 1000,
 *   currency: 'sats',
 *   idempotencyKey: 'game-123-win',
 * })
 *
 * if (result.success) {
 *   console.log('Paid:', result.paymentId)
 * }
 * ```
 *
 * @packageDocumentation
 */

// Server-only enforcement - throws immediately if imported in browser
import { assertServerOnly } from './server-only'
assertServerOnly()

// Main functions
export { payout } from './payout'
export { getBalance, hasEnoughBalance } from './balance'
export { paidFetch } from './paid-fetch'
export { createPaidEndpoint } from './paid-endpoint'

// Types
export type {
  PayoutOptions,
  PayoutResult,
  PayoutPreview,
  PayoutError,
  PayoutErrorCode,
  PayoutDestination,
  PayoutDestinationType,
  PayoutCurrency,
  Balance,
  PaidFetchOptions,
  CreatePaidEndpointOptions,
  PaymentContext,
  PayoutLimits,
} from './types'

export { HARDCODED_CEILINGS } from './types'

// Error classes (for instanceof checks)
export {
  PayoutException,
  BrowserNotAllowedError,
  InvalidSecretError,
  SecretExposedError,
  InvalidDestinationError,
  InvalidAmountError,
  PerPaymentLimitExceededError,
  HourlyLimitExceededError,
  DailyLimitExceededError,
  RateLimitExceededError,
  InsufficientBalanceError,
  DestinationNotAllowedError,
  InvoiceAmountMismatchError,
  PaymentFailedError,
  AbortedByCallbackError,
  CallbackTimeoutError,
  InternalError,
} from './errors'

// Configuration (local settings only - limits enforced server-side)
export { getPayoutConfig, getPayoutLimits, getPayoutSecret } from './config'

// Server communication (for advanced usage)
export {
  authorizePayout,
  completePayout,
  getPayoutLimitsFromServer,
} from './payout-client'

export type {
  AuthorizePayoutRequest,
  AuthorizePayoutResponse,
  CompletePayoutRequest,
} from './payout-client'

// NOTE: No HTTP handlers are exported (prevents SSRF)
// Users must call payout() directly in their server code
