import type { Checkout } from '@moneydevkit/api-contract'

/**
 * User info attached to checkout from authenticated session
 */
export interface CheckoutUserInfo {
  userId: string
  userEmail?: string
  userName?: string
}

/**
 * Parameters for creating a checkout
 */
export interface CheckoutParams {
  /** Title shown to the buyer */
  title: string
  /** Description of the purchase */
  description: string
  /** Amount in cents (USD) or sats (SAT) */
  amount: number
  /** Currency type - USD cents or Bitcoin sats */
  currency?: 'USD' | 'SAT'
  /** URL to redirect to after successful payment */
  successUrl?: string
  /** Custom path for the checkout page (default: /checkout) */
  checkoutPath?: string
  /** Custom metadata to attach to the checkout */
  metadata?: Record<string, unknown>
}

/**
 * Response from creating a checkout
 */
export interface CheckoutResponse {
  checkout: Checkout
  redirectUrl: string
}

export type { Checkout }
