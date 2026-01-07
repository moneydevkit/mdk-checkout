import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'

export type CheckoutError = {
  code: string
  message: string
  details?: unknown
}

export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: CheckoutError }

export type CreateCheckoutResult = Result<{ checkoutUrl: string }>
export type ServerCreateCheckoutResult = Result<{ checkout: CheckoutType }>

// Internal type
export type ClientCreateCheckoutResult = Result<CheckoutType>
