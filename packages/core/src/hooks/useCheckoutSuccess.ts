import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import { useEffect, useState } from 'react'
import { CHECKOUT_ID_QUERY_PARAM } from '../constants'
import { clientGetCheckout } from '../client-actions'
import { log } from '../logging'

async function fetchCheckout(checkoutId: string): Promise<CheckoutType | null> {
  try {
    const checkout = await clientGetCheckout(checkoutId)
    return (checkout as CheckoutType | undefined) ?? null
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Failed to fetch checkout data')
    log('Checkout fetch error:', err)
    return null
  }
}

function isCheckoutPaidStatus(checkout: CheckoutType | null): boolean {
  if (!checkout) {
    return false
  }

  const invoiceSettled = (checkout.invoice?.amountSatsReceived ?? 0) > 0
  return checkout.status === 'PAYMENT_RECEIVED' || invoiceSettled
}

export function useCheckoutSuccess() {
  const [checkoutIdFromQuery, setCheckoutIdFromQuery] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<CheckoutType['userMetadata'] | null>(null)
  const [isCheckoutPaid, setIsCheckoutPaid] = useState<boolean | null>(null)
  const [isCheckoutPaidLoading, setIsCheckoutPaidLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const params = new URLSearchParams(window.location.search)
    setCheckoutIdFromQuery(params.get(CHECKOUT_ID_QUERY_PARAM))
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!checkoutIdFromQuery) {
        setMetadata(null)
        setIsCheckoutPaid(null)
        setIsCheckoutPaidLoading(false)
        return
      }

      setIsCheckoutPaidLoading(true)

      try {
        const fetchedCheckout = await fetchCheckout(checkoutIdFromQuery)
        if (!cancelled) {
          setMetadata(fetchedCheckout?.userMetadata ?? null)
          setIsCheckoutPaid(isCheckoutPaidStatus(fetchedCheckout))
        }
      } finally {
        if (!cancelled) {
          setIsCheckoutPaidLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [checkoutIdFromQuery])

  return {
    metadata,
    isCheckoutPaid,
    isCheckoutPaidLoading,
  }
}
