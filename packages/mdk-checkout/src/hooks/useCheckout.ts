'use client'

import { useCallback, useState } from 'react'
import type { CreateCheckoutParams } from '../server/actions'
import { createCheckout } from '../server/actions'
import { log } from '../server/logging'

export function useCheckout() {
  const [isNavigating, setIsNavigating] = useState(false)

  const navigate = useCallback(async (params: CreateCheckoutParams): Promise<void> => {
    try {
      setIsNavigating(true)

      const checkout = await createCheckout({
        ...params,
      })

      let checkoutPath = params.checkoutPath || '/checkout'

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
