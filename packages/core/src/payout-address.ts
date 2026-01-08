import { warn } from './logging'

/**
 * Supported payout address types
 */
export type PayoutAddressType = 'bolt11' | 'bolt12' | 'lnurl' | 'lightning_address' | 'bip353'

/**
 * Resolved payout address with its detected type
 */
export interface PayoutAddress {
  address: string
  type: PayoutAddressType
}

/**
 * Result of resolving payout configuration from environment
 */
export interface PayoutConfig {
  address: PayoutAddress | null
  isLegacy: boolean
  legacyEnvVar?: string
}

const DEPRECATION_WARNING_SHOWN = new Set<string>()

function showDeprecationWarning(legacyEnvVar: string): void {
  if (DEPRECATION_WARNING_SHOWN.has(legacyEnvVar)) {
    return
  }
  DEPRECATION_WARNING_SHOWN.add(legacyEnvVar)
  warn(
    `[MDK] Deprecation warning: ${legacyEnvVar} is deprecated. Please use PAYOUT_ADDRESS instead. ` +
      `PAYOUT_ADDRESS accepts LNURL, Lightning Address, Bolt12 Offer, and BIP-353 formats.`
  )
}

/**
 * Detects the type of a payout address based on its format.
 *
 * Supported formats:
 * - LNURL: Bech32-encoded string starting with 'lnurl1'
 * - Lightning Address: Email-like format (user@domain.com)
 * - Bolt12 Offer: Bech32-encoded string starting with 'lno1'
 * - BIP-353: Bitcoin payment instruction format (₿user@domain.com or user@domain with DNS resolution)
 *
 * @param address - The payout address to detect
 * @returns The detected address type, or null if unknown
 */
export function detectPayoutAddressType(address: string): PayoutAddressType | null {
  const trimmed = address.trim().toLowerCase()

  // Bolt12 Offer: starts with 'lno1'
  if (trimmed.startsWith('lno1')) {
    return 'bolt12'
  }

  // LNURL: starts with 'lnurl1'
  if (trimmed.startsWith('lnurl1')) {
    return 'lnurl'
  }

  // BIP-353: starts with '₿' symbol
  if (address.trim().startsWith('₿')) {
    return 'bip353'
  }

  // Lightning Address / BIP-353: email-like format (user@domain)
  // This also covers BIP-353 addresses without the ₿ prefix
  if (address.includes('@') && !address.startsWith('@') && !address.endsWith('@')) {
    const parts = address.split('@')
    if (parts.length === 2 && parts[0].length > 0 && parts[1].includes('.')) {
      return 'lightning_address'
    }
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

  return null
}

/**
 * Reads the payout address from environment variables.
 *
 * Priority order:
 * 1. PAYOUT_ADDRESS (new unified env var)
 * 2. WITHDRAWAL_BOLT_12 (legacy, deprecated)
 * 3. WITHDRAWAL_LNURL (legacy, deprecated)
 * 4. WITHDRAWAL_BOLT_11 (legacy, deprecated)
 *
 * When a legacy env var is used, a deprecation warning is logged.
 *
 * @returns PayoutConfig with the resolved address and metadata
 */
export function getPayoutConfig(): PayoutConfig {
  // Check for new unified env var first
  const payoutAddress = process.env.PAYOUT_ADDRESS
  if (payoutAddress) {
    const type = detectPayoutAddressType(payoutAddress)
    if (type) {
      return {
        address: { address: payoutAddress, type },
        isLegacy: false,
      }
    }
    // If type couldn't be detected, log a warning but still return the address
    warn(`[MDK] Could not detect payout address type for PAYOUT_ADDRESS. Please verify the format.`)
    return {
      address: null,
      isLegacy: false,
    }
  }

  // Fall back to legacy env vars with deprecation warnings
  const bolt12 = process.env.WITHDRAWAL_BOLT_12
  if (bolt12) {
    showDeprecationWarning('WITHDRAWAL_BOLT_12')
    return {
      address: { address: bolt12, type: 'bolt12' },
      isLegacy: true,
      legacyEnvVar: 'WITHDRAWAL_BOLT_12',
    }
  }

  const lnurl = process.env.WITHDRAWAL_LNURL
  if (lnurl) {
    showDeprecationWarning('WITHDRAWAL_LNURL')
    // WITHDRAWAL_LNURL can be either an LNURL or a Lightning Address
    const detectedType = detectPayoutAddressType(lnurl)
    return {
      address: {
        address: lnurl,
        type: detectedType === 'lightning_address' ? 'lightning_address' : 'lnurl',
      },
      isLegacy: true,
      legacyEnvVar: 'WITHDRAWAL_LNURL',
    }
  }

  const bolt11 = process.env.WITHDRAWAL_BOLT_11
  if (bolt11) {
    showDeprecationWarning('WITHDRAWAL_BOLT_11')
    return {
      address: { address: bolt11, type: 'bolt11' },
      isLegacy: true,
      legacyEnvVar: 'WITHDRAWAL_BOLT_11',
    }
  }

  return {
    address: null,
    isLegacy: false,
  }
}

/**
 * Gets the payout address for a specific type.
 * Falls back to legacy env vars with deprecation warnings.
 *
 * @param type - The type of payout address to get
 * @returns The address string or null if not configured
 */
export function getPayoutAddressForType(type: PayoutAddressType): string | null {
  const config = getPayoutConfig()

  if (config.address) {
    // If PAYOUT_ADDRESS is set and matches the requested type, use it
    if (config.address.type === type) {
      return config.address.address
    }
    // For BIP-353 and Lightning Address, they can be used interchangeably with LNURL handler
    if (
      type === 'lnurl' &&
      (config.address.type === 'lightning_address' || config.address.type === 'bip353')
    ) {
      return config.address.address
    }
  }

  return null
}

/**
 * Checks if any payout address is configured.
 *
 * @returns true if a payout address is configured
 */
export function hasPayoutAddress(): boolean {
  return getPayoutConfig().address !== null
}

/**
 * Resets the deprecation warning cache (useful for testing)
 */
export function __resetDeprecationWarnings(): void {
  DEPRECATION_WARNING_SHOWN.clear()
}
