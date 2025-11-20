'use client'

import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CHECKOUT_ID_QUERY_PARAM } from '../constants'
import { getCheckout } from '../server/actions'
import { log } from '../server/logging'

async function fetchCheckout(checkoutId: string): Promise<CheckoutType | null> {
  try {
    const checkout = await getCheckout(checkoutId)
    return checkout ?? null
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
  const searchParams = useSearchParams()
  const checkoutIdFromQuery = searchParams?.get(CHECKOUT_ID_QUERY_PARAM)
  const [metadata, setMetadata] = useState<CheckoutType['userMetadata'] | null>(null)
  const [isCheckoutPaid, setIsCheckoutPaid] = useState<boolean | null>(null)
  const [isCheckoutPaidLoading, setIsCheckoutPaidLoading] = useState(() =>
    checkoutIdFromQuery ? true : false,
  )

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
