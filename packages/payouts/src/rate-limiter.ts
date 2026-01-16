/**
 * Rate limiter for @moneydevkit/payouts
 *
 * Implements sliding window rate limiting.
 */

import { RateLimitExceededError } from './errors'
import { getPayoutLimits } from './config'

/**
 * Timestamp of each payment attempt
 */
const paymentTimestamps: number[] = []

/**
 * Lock for atomic operations
 */
let rateLimitLock = Promise.resolve()

/**
 * Checks rate limit and records payment attempt.
 * Uses a sliding window algorithm.
 *
 * @throws RateLimitExceededError if rate limit exceeded
 */
export async function checkRateLimit(): Promise<void> {
  const limits = getPayoutLimits()
  const { rateLimit, rateLimitWindow } = limits

  // Wait for any pending rate limit check to complete
  await rateLimitLock

  // Create new lock for this operation
  let releaseLock: () => void
  rateLimitLock = new Promise((resolve) => {
    releaseLock = resolve
  })

  try {
    const now = Date.now()
    const windowStart = now - rateLimitWindow

    // Clean up old timestamps
    while (paymentTimestamps.length > 0 && paymentTimestamps[0] < windowStart) {
      paymentTimestamps.shift()
    }

    // Check if we've exceeded the limit
    if (paymentTimestamps.length >= rateLimit) {
      // Calculate when the oldest request will expire
      const oldestTimestamp = paymentTimestamps[0]
      const retryAfterMs = oldestTimestamp + rateLimitWindow - now

      throw new RateLimitExceededError(
        rateLimit,
        rateLimitWindow,
        Math.max(retryAfterMs, 100),
      )
    }

    // Record this attempt
    paymentTimestamps.push(now)
  } finally {
    // Release the lock
    releaseLock!()
  }
}

/**
 * Gets current rate limit status
 */
export function getRateLimitStatus(): {
  current: number
  limit: number
  windowMs: number
  remainingMs: number
} {
  const limits = getPayoutLimits()
  const { rateLimit, rateLimitWindow } = limits

  const now = Date.now()
  const windowStart = now - rateLimitWindow

  // Count requests in current window
  const currentCount = paymentTimestamps.filter((t) => t >= windowStart).length

  // Calculate when the oldest request will expire
  const oldestInWindow = paymentTimestamps.find((t) => t >= windowStart)
  const remainingMs = oldestInWindow
    ? Math.max(oldestInWindow + rateLimitWindow - now, 0)
    : rateLimitWindow

  return {
    current: currentCount,
    limit: rateLimit,
    windowMs: rateLimitWindow,
    remainingMs,
  }
}

/**
 * Resets rate limit history (for testing)
 */
export function __resetRateLimitHistory(): void {
  paymentTimestamps.length = 0
  rateLimitLock = Promise.resolve()
}
