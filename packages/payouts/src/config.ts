/**
 * Configuration management for @moneydevkit/payouts
 *
 * The payout secret is validated server-side by moneydevkit.com.
 * Local config handles optional destination allowlist.
 */

import type { PayoutLimits } from './types'

/**
 * Default limits (for reference - actual enforcement is server-side)
 */
const DEFAULT_LIMITS: PayoutLimits = {
  maxSinglePayment: 10_000, // 10k sats per payment
  maxHourly: 50_000, // 50k sats per hour
  maxDaily: 100_000, // 100k sats per day
  rateLimit: 10, // 10 payments per minute
  rateLimitWindow: 60_000, // 1 minute
}

/**
 * Cached config
 */
let cachedConfig: PayoutConfig | null = null

/**
 * Payout configuration
 */
export interface PayoutConfig {
  /**
   * Payout secret (validated server-side)
   */
  secret: string | null

  /**
   * Optional destination allowlist (local enforcement)
   */
  allowedDestinations: string[] | null
}

/**
 * Gets the payout secret from environment
 * Note: Validation happens server-side on moneydevkit.com
 */
export function getPayoutSecret(): string | null {
  return process.env.MDK_PAYOUT_SECRET ?? null
}

/**
 * Loads payout configuration from environment variables.
 * Secret validation is handled server-side by moneydevkit.com.
 */
export function getPayoutConfig(): PayoutConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  // Parse allowed destinations (comma-separated)
  const allowedDestinationsEnv = process.env.MDK_PAYOUT_ALLOWED_DESTINATIONS
  const allowedDestinations = allowedDestinationsEnv
    ? allowedDestinationsEnv
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d.length > 0)
    : null

  cachedConfig = {
    secret: getPayoutSecret(),
    allowedDestinations,
  }

  return cachedConfig
}

/**
 * Resets the config cache (for testing)
 */
export function __resetConfigCache(): void {
  cachedConfig = null
}

/**
 * Gets default payout limits (for reference)
 * Actual limits are enforced server-side by moneydevkit.com
 */
export function getPayoutLimits(): PayoutLimits {
  return { ...DEFAULT_LIMITS }
}
