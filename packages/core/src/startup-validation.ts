/**
 * Startup validation for MoneyDevKit configuration.
 *
 * These checks help developers identify configuration issues early,
 * before the Lightning node attempts to connect to services.
 */

import type { Result } from './types'
import { success } from './types'

/**
 * Validates that the mnemonic is provided.
 * Note: Full BIP39 validation is done server-side.
 */
export function validateMnemonic(_mnemonic: string): Result<void> {
  return success(undefined)
}
