/**
 * Destination parsing and validation for @moneydevkit/payouts
 */

import { InvalidDestinationError, DestinationNotAllowedError } from './errors'
import { getPayoutConfig } from './config'
import type { PayoutDestination, PayoutDestinationType } from './types'

/**
 * Parsed destination with type and address
 */
export interface ParsedDestination {
  type: PayoutDestinationType
  address: string
}

/**
 * Detects the type of a destination string
 */
function detectDestinationType(destination: string): PayoutDestinationType | null {
  const trimmed = destination.trim().toLowerCase()

  // Bolt12 Offer: starts with 'lno1'
  if (trimmed.startsWith('lno1')) {
    return 'bolt12'
  }

  // LNURL: starts with 'lnurl1'
  if (trimmed.startsWith('lnurl1')) {
    return 'lnurl'
  }

  // Bolt11 invoice: starts with 'lnbc' (mainnet), 'lntb' (testnet), 'lnbs' (signet), or 'lnbcrt' (regtest)
  if (
    trimmed.startsWith('lnbc') ||
    trimmed.startsWith('lntb') ||
    trimmed.startsWith('lnbs') ||
    trimmed.startsWith('lnbcrt')
  ) {
    return 'bolt11'
  }

  // Lightning Address: email-like format (user@domain)
  if (destination.includes('@') && !destination.startsWith('@') && !destination.endsWith('@')) {
    const parts = destination.split('@')
    if (parts.length === 2 && parts[0].length > 0 && parts[1].includes('.')) {
      return 'lightning_address'
    }
  }

  return null
}

/**
 * Parses a destination into type and address
 *
 * @throws InvalidDestinationError if destination is invalid
 */
export function parseDestination(destination: PayoutDestination): ParsedDestination {
  // Handle string destinations (auto-detect)
  if (typeof destination === 'string') {
    const trimmed = destination.trim()

    if (!trimmed) {
      throw new InvalidDestinationError('Destination cannot be empty')
    }

    const detectedType = detectDestinationType(trimmed)

    if (!detectedType) {
      throw new InvalidDestinationError(
        'Could not detect destination type. ' +
          'Supported formats: BOLT11 invoice, BOLT12 offer, LNURL, Lightning Address',
      )
    }

    return {
      type: detectedType,
      address: trimmed,
    }
  }

  // Handle explicit type objects
  switch (destination.type) {
    case 'bolt11':
      if (!destination.invoice || !destination.invoice.trim()) {
        throw new InvalidDestinationError('BOLT11 invoice cannot be empty')
      }
      return { type: 'bolt11', address: destination.invoice.trim() }

    case 'bolt12':
      if (!destination.offer || !destination.offer.trim()) {
        throw new InvalidDestinationError('BOLT12 offer cannot be empty')
      }
      return { type: 'bolt12', address: destination.offer.trim() }

    case 'lnurl':
      if (!destination.url || !destination.url.trim()) {
        throw new InvalidDestinationError('LNURL cannot be empty')
      }
      return { type: 'lnurl', address: destination.url.trim() }

    case 'lightning_address':
      if (!destination.address || !destination.address.trim()) {
        throw new InvalidDestinationError('Lightning address cannot be empty')
      }
      return { type: 'lightning_address', address: destination.address.trim() }

    default:
      throw new InvalidDestinationError(
        `Unknown destination type: ${(destination as any).type}`,
      )
  }
}

/**
 * Validates destination against allowlist (if configured)
 *
 * @throws DestinationNotAllowedError if destination is not in allowlist
 */
export function validateDestinationAllowlist(parsed: ParsedDestination): void {
  const config = getPayoutConfig()

  // If no allowlist is configured, all destinations are allowed
  if (!config.allowedDestinations || config.allowedDestinations.length === 0) {
    return
  }

  const allowed = config.allowedDestinations

  // Check for exact match
  if (allowed.includes(parsed.address)) {
    return
  }

  // Check for exact match (case-insensitive for addresses)
  if (allowed.some((a) => a.toLowerCase() === parsed.address.toLowerCase())) {
    return
  }

  // For Lightning addresses, check domain wildcards (e.g., *.wallet.com)
  if (parsed.type === 'lightning_address') {
    const [, domain] = parsed.address.split('@')
    if (domain) {
      // Check for wildcard domain match
      const wildcardMatch = allowed.find((a) => {
        if (a.startsWith('*.')) {
          const wildcardDomain = a.slice(2).toLowerCase()
          return domain.toLowerCase() === wildcardDomain ||
            domain.toLowerCase().endsWith('.' + wildcardDomain)
        }
        return false
      })

      if (wildcardMatch) {
        return
      }

      // Check for exact domain match
      if (allowed.some((a) => a.toLowerCase() === domain.toLowerCase())) {
        return
      }
    }
  }

  // For LNURL, extract and check domain
  if (parsed.type === 'lnurl') {
    // LNURL is bech32-encoded, we'd need to decode it to check domain
    // For now, only allow exact matches for LNURL
  }

  throw new DestinationNotAllowedError(parsed.address)
}

/**
 * Extracts domain from a Lightning address
 */
export function extractDomain(address: string): string | null {
  if (!address.includes('@')) {
    return null
  }

  const parts = address.split('@')
  if (parts.length !== 2) {
    return null
  }

  return parts[1]
}
