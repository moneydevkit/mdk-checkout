import { useCallback, useState } from 'react'
import type { CreateCheckoutParams } from '../actions'
import { clientCreateCheckout } from '../client-actions'
import { log } from '../logging'

export function useCheckout() {
  const [isNavigating, setIsNavigating] = useState(false)

  const navigate = useCallback(async (params: CreateCheckoutParams): Promise<void> => {
    try {
      setIsNavigating(true)

      const checkout = await clientCreateCheckout({
        ...params,
      })

      const checkoutPath = params.checkoutPath || '/checkout'

      window.location.href = `${checkoutPath}/${checkout.id}`
    } catch (error) {
      setIsNavigating(false)
      const err = error instanceof Error ? error : new Error('Checkout creation failed')
      log('Checkout navigation error:', err)
    }
  }, [])

  return {
    navigate,
    isNavigating,
  }
}
