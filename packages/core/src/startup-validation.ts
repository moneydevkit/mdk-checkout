/**
 * Startup validation for MoneyDevKit configuration.
 *
 * These checks help developers identify configuration issues early,
 * before the Lightning node attempts to connect to services.
 */

import * as bip39 from 'bip39'
import type { Result } from './types'

/**
 * Validates that the mnemonic is a valid BIP39 mnemonic.
 * Uses the bip39 library for proper validation including checksum verification.
 */
export function validateMnemonic(mnemonic: string): Result<void> {
  if (!mnemonic || typeof mnemonic !== 'string') {
    return {
      data: null,
      error: {
        code: 'mnemonic_missing',
        message: 'MDK_MNEMONIC environment variable is not set.',
        suggestion: 'Set MDK_MNEMONIC to a valid 12 or 24 word BIP39 mnemonic phrase.',
      },
    }
  }

  // Normalize whitespace: trim and collapse multiple spaces to single space
  const normalized = mnemonic.trim().split(/\s+/).join(' ')

  if (!bip39.validateMnemonic(normalized)) {
    const words = normalized.split(' ')

    // Provide more specific error messages
    if (words.length !== 12 && words.length !== 24) {
      return {
        data: null,
        error: {
          code: 'mnemonic_invalid_word_count',
          message: `Mnemonic has ${words.length} words, but must have 12 or 24 words.`,
          suggestion: 'Check that MDK_MNEMONIC contains a valid BIP39 mnemonic with exactly 12 or 24 words.',
        },
      }
    }

    return {
      data: null,
      error: {
        code: 'mnemonic_invalid',
        message: 'Mnemonic is not a valid BIP39 mnemonic. Words may be misspelled or the checksum is invalid.',
        suggestion: 'Check that MDK_MNEMONIC contains valid BIP39 words. You can generate a new mnemonic using the generateMnemonic() function from @moneydevkit/lightning-js.',
      },
    }
  }

  return { data: undefined, error: null }
}
