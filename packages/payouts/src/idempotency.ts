/**
 * Idempotency key management for @moneydevkit/payouts
 *
 * Prevents duplicate payments from retries or bugs.
 * In production, this should be backed by VSS for persistence.
 */

import type { PayoutResult } from './types'

/**
 * Cached idempotency result
 */
interface CachedResult {
  result: PayoutResult
  timestamp: number
}

/**
 * In-memory cache of idempotency keys -> results
 * In production, this should be backed by VSS
 */
const idempotencyCache = new Map<string, CachedResult>()

/**
 * TTL for idempotency keys (24 hours)
 */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

/**
 * In-progress payments (to prevent concurrent duplicate requests)
 */
const inProgress = new Set<string>()

/**
 * Checks if we have a cached result for an idempotency key
 *
 * @returns Cached result if found and not expired, null otherwise
 */
export function getCachedResult(idempotencyKey: string): PayoutResult | null {
  const cached = idempotencyCache.get(idempotencyKey)

  if (!cached) {
    return null
  }

  // Check if expired
  if (Date.now() - cached.timestamp > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(idempotencyKey)
    return null
  }

  return {
    ...cached.result,
    cached: true,
  }
}

/**
 * Marks a payment as in progress (prevents concurrent duplicate requests)
 *
 * @returns true if marked, false if already in progress
 */
export function markInProgress(idempotencyKey: string): boolean {
  if (inProgress.has(idempotencyKey)) {
    return false
  }

  inProgress.add(idempotencyKey)
  return true
}

/**
 * Clears in-progress status
 */
export function clearInProgress(idempotencyKey: string): void {
  inProgress.delete(idempotencyKey)
}

/**
 * Caches a result for an idempotency key
 */
export function cacheResult(idempotencyKey: string, result: PayoutResult): void {
  idempotencyCache.set(idempotencyKey, {
    result,
    timestamp: Date.now(),
  })
}

/**
 * Cleans up expired entries from the cache
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now()

  for (const [key, cached] of idempotencyCache.entries()) {
    if (now - cached.timestamp > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key)
    }
  }
}

/**
 * Resets idempotency cache (for testing)
 */
export function __resetIdempotencyCache(): void {
  idempotencyCache.clear()
  inProgress.clear()
}
