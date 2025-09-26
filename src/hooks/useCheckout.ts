'use client'

import { useState, useCallback } from 'react'
import type { CreateCheckoutParams } from '../server/actions'
import { createCheckout } from '../server/actions'
import { DEFAULT_LSP_NODE_ID } from '../constants'

export interface UseCheckoutOptions {
  /** Path to the checkout page (defaults to '/checkout') */
  checkoutPath?: string
  /** Override the Lightning Service Provider node id */
  lspNodeId?: string
  /** Called when navigation fails */
  onError?: (error: Error) => void
  /** Called after successful checkout completion */
  onSuccess?: (result: any) => void
}

export interface CheckoutResult {
  checkoutId: string
  status: 'completed' | 'pending' | 'cancelled'
  [key: string]: any
}

export function useCheckout(options: UseCheckoutOptions = {}) {
  const {
    checkoutPath = '/checkout',
    lspNodeId = DEFAULT_LSP_NODE_ID,
    onError,
    onSuccess
  } = options

  const [isNavigating, setIsNavigating] = useState(false)

  const navigate = useCallback(async (params: CreateCheckoutParams): Promise<void> => {
    try {
      setIsNavigating(true)

      // Create checkout via API and get ID
      const checkout = await createCheckout({
        ...params,
        lspNodeId: params.lspNodeId ?? lspNodeId,
      })

      // Navigate to the specific checkout page
      window.location.href = `${checkoutPath}/${checkout.id}`
    } catch (error) {
      setIsNavigating(false)
      const err = error instanceof Error ? error : new Error('Checkout creation failed')
      if (onError) {
        onError(err)
      } else {
        console.error('Checkout creation failed:', err)
      }
    }
  }, [checkoutPath, lspNodeId, onError])

  const handleSuccess = useCallback((result: CheckoutResult) => {
    if (onSuccess) {
      onSuccess(result)
    }
  }, [onSuccess])

  return {
    navigate,
    isNavigating,
    handleSuccess
  }
}