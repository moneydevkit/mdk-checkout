/**
 * Type definitions for @moneydevkit/payouts
 */

/**
 * Supported currencies for payout amounts.
 * Amounts are converted to sats by moneydevkit.com using current exchange rates.
 */
export type PayoutCurrency = 'sats' | 'btc' | 'usd' | 'eur'

/**
 * Supported payout destination types
 */
export type PayoutDestinationType = 'bolt11' | 'bolt12' | 'lnurl' | 'lightning_address'

/**
 * Payout destination - can be auto-detected string or explicit type
 */
export type PayoutDestination =
  | string // Auto-detect: BOLT11, BOLT12, LNURL, Lightning Address
  | { type: 'bolt11'; invoice: string }
  | { type: 'bolt12'; offer: string }
  | { type: 'lnurl'; url: string }
  | { type: 'lightning_address'; address: string }

/**
 * Options for the payout function
 */
export interface PayoutOptions {
  /**
   * Payment destination - BOLT11, BOLT12, LNURL, or Lightning Address
   * Can be a string (auto-detected) or explicit type object
   */
  destination: PayoutDestination

  /**
   * Amount to pay
   */
  amount: number

  /**
   * Currency of the amount (default: 'sats')
   * Non-sat amounts are converted using moneydevkit.com exchange rates
   */
  currency?: PayoutCurrency

  /**
   * Required unique key to prevent duplicate payments
   * Same key within 24h returns previous result (success or failure)
   */
  idempotencyKey: string

  /**
   * Optional callback called BEFORE payment is sent
   * Return false to abort the payment
   */
  beforePayout?: (payment: PayoutPreview) => Promise<boolean> | boolean

  /**
   * Optional callback called AFTER payment completes (success or failure)
   */
  afterPayout?: (result: PayoutResult) => Promise<void> | void
}

/**
 * Preview of payment details before sending
 */
export interface PayoutPreview {
  /**
   * Resolved destination type
   */
  destinationType: PayoutDestinationType

  /**
   * Resolved destination address
   */
  destination: string

  /**
   * Amount in sats (after currency conversion)
   */
  amountSats: number

  /**
   * Original amount and currency
   */
  originalAmount: number
  originalCurrency: PayoutCurrency

  /**
   * Idempotency key
   */
  idempotencyKey: string
}

/**
 * Result of a payout operation
 */
export interface PayoutResult {
  /**
   * Whether the payment succeeded
   */
  success: boolean

  /**
   * Payment ID if successful
   */
  paymentId?: string

  /**
   * Amount paid in sats
   */
  amountSats?: number

  /**
   * Error information if failed
   */
  error?: PayoutError

  /**
   * Whether this was a cached result from a previous idempotent request
   */
  cached?: boolean
}

/**
 * Structured error for payout failures
 */
export interface PayoutError {
  /**
   * Error code for programmatic handling
   */
  code: PayoutErrorCode

  /**
   * Human-readable error message (no sensitive info)
   */
  message: string

  /**
   * Retry-after hint in milliseconds (for rate limit errors)
   */
  retryAfterMs?: number
}

/**
 * Error codes for payout failures
 */
export type PayoutErrorCode =
  | 'BROWSER_NOT_ALLOWED'
  | 'INVALID_SECRET'
  | 'SECRET_EXPOSED'
  | 'INVALID_DESTINATION'
  | 'INVALID_AMOUNT'
  | 'PER_PAYMENT_LIMIT_EXCEEDED'
  | 'HOURLY_LIMIT_EXCEEDED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_BALANCE'
  | 'DESTINATION_NOT_ALLOWED'
  | 'INVOICE_AMOUNT_MISMATCH'
  | 'PAYMENT_FAILED'
  | 'ABORTED_BY_CALLBACK'
  | 'CALLBACK_TIMEOUT'
  | 'INTERNAL_ERROR'

/**
 * Wallet balance information
 */
export interface Balance {
  /**
   * Balance in satoshis
   */
  sats: number

  /**
   * Balance in BTC
   */
  btc: number

  /**
   * Balance in USD (approximate)
   */
  usd: number

  /**
   * Balance in EUR (approximate)
   */
  eur: number
}

/**
 * Options for paidFetch (agent/L402 payments)
 */
export interface PaidFetchOptions extends RequestInit {
  /**
   * Payment options for L402 flow
   */
  payment: {
    /**
     * Maximum sats to pay for this request
     */
    maxSats: number
  }
}

/**
 * Options for creating a paid endpoint (tool provider)
 */
export interface CreatePaidEndpointOptions<T> {
  /**
   * Price in sats for using this endpoint
   */
  priceSats: number

  /**
   * Handler function called after payment is received
   */
  handler: (req: Request, context: { payment: PaymentContext }) => Promise<T> | T
}

/**
 * Context provided to paid endpoint handlers
 */
export interface PaymentContext {
  /**
   * Amount paid in sats
   */
  amountSats: number

  /**
   * Payment preimage (proof of payment)
   */
  preimage: string

  /**
   * Payment hash
   */
  paymentHash: string
}

/**
 * Configuration for payout limits
 */
export interface PayoutLimits {
  /**
   * Maximum sats per single payment
   */
  maxSinglePayment: number

  /**
   * Maximum sats per hour (rolling window)
   */
  maxHourly: number

  /**
   * Maximum sats per day (rolling 24h window)
   */
  maxDaily: number

  /**
   * Maximum payments per minute
   */
  rateLimit: number

  /**
   * Rate limit window in milliseconds
   */
  rateLimitWindow: number
}

/**
 * Hardcoded ceilings that cannot be exceeded via env vars
 */
export const HARDCODED_CEILINGS = {
  /**
   * Absolute maximum per single payment (100k sats)
   */
  MAX_SINGLE_PAYMENT: 100_000,

  /**
   * Absolute maximum per day (1M sats)
   */
  MAX_DAILY: 1_000_000,
} as const
