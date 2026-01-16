/**
 * Spending limits enforcement for @moneydevkit/payouts
 *
 * Implements atomic limit checks with rolling windows.
 * Note: In production, these limits should be enforced server-side
 * on moneydevkit.com for true security. This is a client-side layer.
 */

import {
  PerPaymentLimitExceededError,
  HourlyLimitExceededError,
  DailyLimitExceededError,
} from './errors'
import { getPayoutLimits } from './config'
import type { PayoutLimits } from './types'

/**
 * Payment record for tracking spending
 */
interface PaymentRecord {
  amountSats: number
  timestamp: number
}

/**
 * In-memory spending tracker (process-level)
 * In production, this should be backed by VSS or similar persistent store
 */
const paymentHistory: PaymentRecord[] = []

/**
 * Lock for atomic operations
 */
let limitLock = Promise.resolve()

/**
 * One hour in milliseconds
 */
const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * One day in milliseconds
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Calculates spending in a time window
 */
function getSpendingInWindow(windowMs: number): number {
  const now = Date.now()
  const windowStart = now - windowMs

  return paymentHistory
    .filter((record) => record.timestamp >= windowStart)
    .reduce((sum, record) => sum + record.amountSats, 0)
}

/**
 * Cleans up old records outside the daily window
 */
function cleanupOldRecords(): void {
  const cutoff = Date.now() - ONE_DAY_MS
  const firstValidIndex = paymentHistory.findIndex(
    (record) => record.timestamp >= cutoff,
  )

  if (firstValidIndex > 0) {
    paymentHistory.splice(0, firstValidIndex)
  }
}

/**
 * Atomically checks and reserves spending limit.
 * Uses a simple lock to prevent concurrent requests from bypassing limits.
 *
 * @param amountSats - Amount to spend
 * @returns Promise that resolves when limit is reserved
 * @throws PerPaymentLimitExceededError if per-payment limit exceeded
 * @throws HourlyLimitExceededError if hourly limit exceeded
 * @throws DailyLimitExceededError if daily limit exceeded
 */
export async function checkAndReserveLimit(amountSats: number): Promise<void> {
  const limits = getPayoutLimits()

  // Wait for any pending limit check to complete
  await limitLock

  // Create new lock for this operation
  let releaseLock: () => void
  limitLock = new Promise((resolve) => {
    releaseLock = resolve
  })

  try {
    // Clean up old records first
    cleanupOldRecords()

    // Check per-payment limit
    checkPerPaymentLimit(amountSats, limits)

    // Check hourly limit (rolling window)
    const hourlySpending = getSpendingInWindow(ONE_HOUR_MS)
    if (hourlySpending + amountSats > limits.maxHourly) {
      // Calculate retry-after based on oldest record in window
      const oldestInWindow = paymentHistory.find(
        (r) => r.timestamp >= Date.now() - ONE_HOUR_MS,
      )
      const retryAfterMs = oldestInWindow
        ? oldestInWindow.timestamp + ONE_HOUR_MS - Date.now()
        : ONE_HOUR_MS

      throw new HourlyLimitExceededError(
        limits.maxHourly,
        hourlySpending,
        Math.max(retryAfterMs, 1000),
      )
    }

    // Check daily limit (rolling 24h window)
    const dailySpending = getSpendingInWindow(ONE_DAY_MS)
    if (dailySpending + amountSats > limits.maxDaily) {
      // Calculate retry-after based on oldest record in window
      const oldestInWindow = paymentHistory.find(
        (r) => r.timestamp >= Date.now() - ONE_DAY_MS,
      )
      const retryAfterMs = oldestInWindow
        ? oldestInWindow.timestamp + ONE_DAY_MS - Date.now()
        : ONE_DAY_MS

      throw new DailyLimitExceededError(
        limits.maxDaily,
        dailySpending,
        Math.max(retryAfterMs, 1000),
      )
    }

    // All checks passed - record the payment (reserve the limit)
    paymentHistory.push({
      amountSats,
      timestamp: Date.now(),
    })
  } finally {
    // Release the lock
    releaseLock!()
  }
}

/**
 * Checks per-payment limit (synchronous, no state change)
 *
 * @throws PerPaymentLimitExceededError if limit exceeded
 */
export function checkPerPaymentLimit(
  amountSats: number,
  limits: PayoutLimits,
): void {
  if (amountSats > limits.maxSinglePayment) {
    throw new PerPaymentLimitExceededError(limits.maxSinglePayment, amountSats)
  }
}

/**
 * Removes a payment record (for rollback on failure)
 * Should be called if payment fails after checkAndReserveLimit succeeds
 */
export function releaseLimit(amountSats: number, timestamp: number): void {
  const index = paymentHistory.findIndex(
    (r) => r.amountSats === amountSats && r.timestamp === timestamp,
  )

  if (index !== -1) {
    paymentHistory.splice(index, 1)
  }
}

/**
 * Gets current spending stats (for debugging/monitoring)
 */
export function getSpendingStats(): {
  hourlySpending: number
  dailySpending: number
  paymentsInLastHour: number
  paymentsInLastDay: number
} {
  cleanupOldRecords()

  const now = Date.now()
  const hourStart = now - ONE_HOUR_MS
  const dayStart = now - ONE_DAY_MS

  const hourRecords = paymentHistory.filter((r) => r.timestamp >= hourStart)
  const dayRecords = paymentHistory.filter((r) => r.timestamp >= dayStart)

  return {
    hourlySpending: hourRecords.reduce((sum, r) => sum + r.amountSats, 0),
    dailySpending: dayRecords.reduce((sum, r) => sum + r.amountSats, 0),
    paymentsInLastHour: hourRecords.length,
    paymentsInLastDay: dayRecords.length,
  }
}

/**
 * Resets spending history (for testing)
 */
export function __resetSpendingHistory(): void {
  paymentHistory.length = 0
  limitLock = Promise.resolve()
}
