import { useCallback, useState } from 'react'
import type { CreateCheckoutParams } from '../actions'
import { clientCreateCheckout } from '../client-actions'
import { log } from '../logging'
import { failure, success } from '../types'
import type { MdkError, Result } from '../types'

/**
 * Hook for creating checkout sessions.
 *
 * @example
 * ```tsx
 * const { createCheckout } = useCheckout()
 *
 * // Amount-based checkout (donations, tips)
 * await createCheckout({ type: 'AMOUNT', amount: 1000, title: 'Donation' })
 *
 * // Product checkout
 * await createCheckout({ type: 'PRODUCTS', product: 'prod_123' })
 *
 * // With useProducts hook
 * const { products } = useProducts()
 * await createCheckout({ type: 'PRODUCTS', product: products[0].id })
 * ```
 */
export function useCheckout() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<MdkError | null>(null)

  const createCheckout = useCallback(async (params: CreateCheckoutParams): Promise<Result<{ checkoutUrl: string }>> => {
    setIsLoading(true)
    setError(null)

    const result = await clientCreateCheckout(params)

    setIsLoading(false)

    if (result.error) {
      setError(result.error)
      return failure(result.error)
    }

    const checkoutPath = params.checkoutPath || '/checkout'
    const checkoutUrl = `${checkoutPath}/${result.data.id}`

    return success({ checkoutUrl })
  }, [])

  /**
   * @deprecated Use `createCheckout()` instead for better error handling.
   * This function auto-redirects on success and silently logs errors.
   */
  const navigate = useCallback(async (params: CreateCheckoutParams): Promise<void> => {
    const result = await createCheckout(params)
    if (result.error) {
      log('Checkout navigation error:', result.error)
      return
    }
    window.location.href = result.data.checkoutUrl
  }, [createCheckout])

  return {
    /** Create a checkout and return the URL. Does not redirect automatically. */
    createCheckout,
    /**
     * @deprecated Use `createCheckout()` instead for better error handling.
     */
    navigate,
    /** Whether a checkout operation is in progress */
    isLoading,
    /**
     * @deprecated Use `isLoading` instead.
     */
    isNavigating: isLoading,
    /** The last error that occurred, if any */
    error,
  }
}
