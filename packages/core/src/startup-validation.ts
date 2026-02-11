/**
 * Startup validation for MoneyDevKit configuration.
 *
 * These checks help developers identify configuration issues early,
 * before the Lightning node attempts to connect to services.
 */

import type { Result } from './types'
import { failure, success } from './types'
import { BIP39_WORDLIST } from './bip39-wordlist'

const VALID_WORD_COUNTS = [12, 15, 18, 21, 24] as const


export function validateMnemonic(mnemonic: string): Result<void> {
  const cleaned = mnemonic.trim().replace(/^["']|["']$/g, '')
  const words = cleaned.trim().split(/\s+/)
  const wordCount = words.length

  if (!VALID_WORD_COUNTS.includes(wordCount as (typeof VALID_WORD_COUNTS)[number])) {
    return failure({
      code: 'INVALID_MNEMONIC_LENGTH',
      message: `Invalid mnemonic: expected 12, 15, 18, 21, or 24 words, but got ${wordCount}.`,
      suggestion: 'Please check your MDK_MNEMONIC environment variable.',
    })
  }

  const invalidWords = words.filter((word) => !BIP39_WORDLIST.has(word.toLowerCase()))

  if (invalidWords.length > 0) {
    return failure({
      code: 'INVALID_MNEMONIC_WORDS',
      message: `Invalid mnemonic: the following words are not in the BIP39 wordlist: ${invalidWords.join(', ')}.`,
      suggestion: 'Please check your MDK_MNEMONIC environment variable for typos.',
    })
  }

  return success(undefined)
}
