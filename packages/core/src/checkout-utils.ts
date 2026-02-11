import type { Checkout } from '@moneydevkit/api-contract'

type UnconfirmedCheckoutType = Extract<Checkout, { status: 'UNCONFIRMED' }>

/**
 * Convert camelCase field name to readable label.
 * e.g., "billingAddress" -> "Billing Address"
 * @internal Exported for testing
 */
export function fieldToLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}

/**
 * Get fields that need to be shown in the form.
 * A field is shown if it's in requireCustomerData and not already provided.
 * @internal Exported for testing
 */
export function getMissingRequiredFields(checkout: UnconfirmedCheckoutType): string[] {
  if (!checkout.requireCustomerData) return []

  return checkout.requireCustomerData.filter((field: string) => {
    const value = checkout.customer?.[field]
    return value === undefined || value === null || value === ''
  })
}

type Currency = 'USD' | 'SAT'

/**
 * Convert user-entered custom price amount to smallest unit for API.
 * - USD: converts dollars to cents (multiply by 100, with EPSILON for float precision)
 * - SAT: uses value directly (amounts are already in sats)
 * @internal Exported for testing
 */
export function convertCustomAmountToSmallestUnit(
  amount: string,
  currency: Currency
): number {
  const parsedAmount = Number.parseFloat(amount)
  if (Number.isNaN(parsedAmount)) {
    return 0
  }

  if (currency === 'USD') {
    return Math.round(parsedAmount * 100 + Number.EPSILON)
  }
  return Math.round(parsedAmount)
}

/**
 * Validate custom price amount input.
 * Returns error message if invalid, null if valid.
 * @internal Exported for testing
 */
export function validateCustomAmount(
  amount: string,
  currency: Currency
): string | null {
  if (!amount) {
    return currency === 'SAT'
      ? 'Please enter at least 1 sat'
      : 'Please enter a valid amount'
  }

  const parsedAmount = Number.parseFloat(amount)
  const minAmount = currency === 'SAT' ? 1 : 0.01

  if (Number.isNaN(parsedAmount) || parsedAmount < minAmount) {
    return currency === 'SAT'
      ? 'Please enter at least 1 sat'
      : 'Please enter a valid amount'
  }

  return null
}

/**
 * Format recurring interval for display.
 *
 * @param interval - The interval (e.g., "MONTH", "QUARTER", "YEAR")
 * @param style - "short" for "/mo", "long" for "month", "label" for "Monthly"
 * @returns Formatted interval string
 * @internal Exported for testing
 */
export function formatInterval(
  interval: string | null | undefined,
  style: 'short' | 'long' | 'label' = 'long'
): string {
  const normalized = interval?.toUpperCase()
  if (style === 'short') {
    switch (normalized) {
      case 'MONTH':
        return '/mo'
      case 'QUARTER':
        return '/qtr'
      case 'YEAR':
        return '/yr'
      default:
        return ''
    }
  }
  if (style === 'label') {
    switch (normalized) {
      case 'MONTH':
        return 'Monthly'
      case 'QUARTER':
        return 'Quarterly'
      case 'YEAR':
        return 'Yearly'
      default:
        return ''
    }
  }
  // long style
  switch (normalized) {
    case 'MONTH':
      return 'month'
    case 'QUARTER':
      return 'quarter'
    case 'YEAR':
      return 'year'
    default:
      return interval?.toLowerCase() ?? ''
  }
}
