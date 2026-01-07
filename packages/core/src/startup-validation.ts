/**
 * Startup validation for MoneyDevKit configuration.
 *
 * These checks help developers identify configuration issues early,
 * before the Lightning node attempts to connect to services.
 */

import * as bip39 from 'bip39'
import { resolveMoneyDevKitOptions } from './mdk'
import { log, error as logError } from './logging'

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: ValidationError }

export type ValidationError = {
  code: string
  message: string
  suggestion?: string
}

/**
 * Validates that the mnemonic is a valid BIP39 mnemonic.
 * Uses the bip39 library for proper validation including checksum verification.
 */
export function validateMnemonic(mnemonic: string): ValidationResult {
  if (!mnemonic || typeof mnemonic !== 'string') {
    return {
      ok: false,
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
        ok: false,
        error: {
          code: 'mnemonic_invalid_word_count',
          message: `Mnemonic has ${words.length} words, but must have 12 or 24 words.`,
          suggestion: 'Check that MDK_MNEMONIC contains a valid BIP39 mnemonic with exactly 12 or 24 words.',
        },
      }
    }

    return {
      ok: false,
      error: {
        code: 'mnemonic_invalid',
        message: 'Mnemonic is not a valid BIP39 mnemonic. Words may be misspelled or the checksum is invalid.',
        suggestion: 'Check that MDK_MNEMONIC contains valid BIP39 words. You can generate a new mnemonic using the generateMnemonic() function from @moneydevkit/lightning-js.',
      },
    }
  }

  return { ok: true }
}

/**
 * Validates that a URL is properly formatted.
 */
function validateUrl(url: string, name: string): ValidationResult {
  if (!url || typeof url !== 'string') {
    return {
      ok: false,
      error: {
        code: 'url_missing',
        message: `${name} URL is not configured.`,
        suggestion: `Check that the ${name} URL is properly set.`,
      },
    }
  }

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        ok: false,
        error: {
          code: 'url_invalid_protocol',
          message: `${name} URL has invalid protocol "${parsed.protocol}".`,
          suggestion: `${name} URL must use http:// or https:// protocol.`,
        },
      }
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'url_invalid_format',
        message: `${name} URL "${url}" is not a valid URL.`,
        suggestion: `Check the format of your ${name} URL.`,
      },
    }
  }

  return { ok: true }
}

/**
 * Tests connectivity to the VSS (Versioned State Storage) service.
 */
export async function checkVssConnectivity(vssUrl: string): Promise<ValidationResult> {
  const urlValidation = validateUrl(vssUrl, 'VSS')
  if (!urlValidation.ok) return urlValidation

  try {
    // VSS doesn't have a standard health endpoint, but we can try a simple HEAD request
    // to verify the server is reachable. A 4xx response is fine - it means the server is up.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(vssUrl, {
      method: 'HEAD',
      signal: controller.signal,
    })
    clearTimeout(timeout)

    // Any response (even 4xx/5xx) means the server is reachable
    log(`VSS connectivity check: server responded with status ${response.status}`)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (message.includes('abort') || message.includes('timeout')) {
      return {
        ok: false,
        error: {
          code: 'vss_timeout',
          message: `VSS server at ${vssUrl} did not respond within 10 seconds.`,
          suggestion: 'Check that the VSS URL is correct and the server is running.',
        },
      }
    }

    return {
      ok: false,
      error: {
        code: 'vss_unreachable',
        message: `Cannot connect to VSS server at ${vssUrl}: ${message}`,
        suggestion: 'Check that the VSS URL is correct and the server is accessible from your network.',
      },
    }
  }
}

export type StartupValidationOptions = {
  /** Skip VSS connectivity check */
  skipVss?: boolean
}

export type StartupValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] }

/**
 * Runs all startup validation checks.
 *
 * This function validates:
 * - MDK_MNEMONIC is a valid BIP39 mnemonic
 * - VSS server is reachable (unless skipVss is true)
 *
 * @example
 * ```ts
 * import { validateStartupConfig } from '@moneydevkit/core'
 *
 * const result = await validateStartupConfig()
 *
 * if (!result.ok) {
 *   for (const error of result.errors) {
 *     console.error(`[${error.code}] ${error.message}`)
 *     if (error.suggestion) {
 *       console.error(`  Suggestion: ${error.suggestion}`)
 *     }
 *   }
 *   process.exit(1)
 * }
 * ```
 */
export async function validateStartupConfig(
  options: StartupValidationOptions = {}
): Promise<StartupValidationResult> {
  const errors: ValidationError[] = []

  // Get resolved configuration
  let config: ReturnType<typeof resolveMoneyDevKitOptions>
  try {
    config = resolveMoneyDevKitOptions()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push({
      code: 'config_error',
      message: `Failed to resolve MDK configuration: ${message}`,
      suggestion: 'Check that MDK_ACCESS_TOKEN and MDK_MNEMONIC environment variables are set.',
    })
    return { ok: false, errors }
  }

  // Validate mnemonic
  const mnemonicResult = validateMnemonic(config.mnemonic)
  if (!mnemonicResult.ok) {
    errors.push(mnemonicResult.error)
  }

  // Check VSS connectivity
  if (!options.skipVss && config.nodeOptions?.vssUrl) {
    log('Checking VSS connectivity...')
    const vssResult = await checkVssConnectivity(config.nodeOptions.vssUrl)
    if (!vssResult.ok) {
      errors.push(vssResult.error)
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true }
}

/**
 * Runs startup validation and logs any errors.
 * This is a convenience function for quick validation during development.
 *
 * @returns true if all checks passed, false otherwise
 */
export async function runStartupValidation(
  options: StartupValidationOptions = {}
): Promise<boolean> {
  log('Running MDK startup validation...')

  const result = await validateStartupConfig(options)

  if (!result.ok) {
    logError('MDK startup validation failed:')
    for (const error of result.errors) {
      logError(`  [${error.code}] ${error.message}`)
      if (error.suggestion) {
        logError(`    Suggestion: ${error.suggestion}`)
      }
    }
    return false
  }

  log('MDK startup validation passed.')
  return true
}
