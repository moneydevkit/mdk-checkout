'use client'

import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import ExpiredCheckout from './checkout/ExpiredCheckout'
import PaymentReceivedCheckout from './checkout/PaymentReceivedCheckout'
import PendingPaymentCheckout from './checkout/PendingPaymentCheckout'
import UnconfirmedCheckout from './checkout/UnconfirmedCheckout'
import { getCheckout } from '../server/actions'

export interface CheckoutProps {
  id: string
  onSuccess?: (checkout: CheckoutType) => void
  title?: string
  description?: string
}

const PENDING_PAYMENT_REFETCH_INTERVAL_MS = 1000

interface CheckoutLayoutProps {
  title?: string
  description?: string
  children: ReactNode
}

function CheckoutLayout({ title, description, children }: CheckoutLayoutProps) {
  return (
    <div className="w-fit mx-auto" style={{ width: '380px' }}>
      {(title || description) && (
        <div className="text-center mb-6">
          {title && (
            <h2 className="text-2xl font-semibold text-white mb-2 font-sans tracking-tight">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-gray-300">{description}</p>
          )}
        </div>
      )}
      <div className="bg-gray-800 rounded-2xl p-6 text-white font-sans">{children}</div>
      <div className="text-center mt-6">
        <p className="text-xs text-gray-500 font-sans">
          Powered by{' '}
          <a
            href="https://www.moneydevkit.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-white transition-colors underline decoration-gray-600 hover:decoration-white"
          >
            moneydevkit
          </a>
        </p>
      </div>
    </div>
  )
}

export function Checkout({ id, onSuccess, title, description }: CheckoutProps) {
  const { data: checkout } = useQuery({
    queryKey: ['mdk-checkout', id],
    queryFn: () => getCheckout(id),
    refetchInterval: ({ state: { data } }) => {
      if (data?.status === 'PENDING_PAYMENT') {
        return PENDING_PAYMENT_REFETCH_INTERVAL_MS
      }
      return false
    },
    refetchIntervalInBackground: true,
  })

  if (!checkout) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    )
  }

  const resolvedTitle = (() => {
    if (title) return title
    switch (checkout.status) {
      case 'UNCONFIRMED':
        return 'Checkout'
      case 'PENDING_PAYMENT':
        return 'ImageMint'
      case 'PAYMENT_RECEIVED':
        return 'Payment Successful!'
      case 'EXPIRED':
        return 'Checkout Expired'
      default:
        return 'Checkout'
    }
  })()

  const resolvedDescription = (() => {
    if (description) return description
    if (checkout.status === 'PENDING_PAYMENT') {
      return checkout.userMetadata?.prompt ? `'${checkout.userMetadata.prompt}'` : undefined
    }
    return undefined
  })()

  return (
    <div className="flex justify-center min-h-screen p-4 pt-8 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800">
      <div className="w-full max-w-md">
        {(() => {
          switch (checkout.status) {
            case 'UNCONFIRMED':
              return (
                <CheckoutLayout title={resolvedTitle} description={resolvedDescription}>
                  <UnconfirmedCheckout checkout={checkout as Extract<CheckoutType, { status: 'UNCONFIRMED' }>} />
                </CheckoutLayout>
              )
            case 'CONFIRMED':
              return (
                <CheckoutLayout title={resolvedTitle} description={resolvedDescription}>
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
                    <p className="text-gray-300">Generating invoice...</p>
                  </div>
                </CheckoutLayout>
              )
            case 'PENDING_PAYMENT':
              return (
                <CheckoutLayout title={resolvedTitle} description={resolvedDescription}>
                  <PendingPaymentCheckout checkout={checkout as Extract<CheckoutType, { status: 'PENDING_PAYMENT' }>} />
                </CheckoutLayout>
              )
            case 'PAYMENT_RECEIVED':
              return (
                <CheckoutLayout title={resolvedTitle} description={resolvedDescription}>
                  <PaymentReceivedCheckout
                    checkout={checkout as Extract<CheckoutType, { status: 'PAYMENT_RECEIVED' }>}
                    onSuccess={onSuccess}
                  />
                </CheckoutLayout>
              )
            case 'EXPIRED':
              return (
                <CheckoutLayout title={resolvedTitle} description={resolvedDescription}>
                  <ExpiredCheckout checkout={checkout as Extract<CheckoutType, { status: 'EXPIRED' }>}
                  />
                </CheckoutLayout>
              )
            default:
              return null
          }
        })()}
      </div>
    </div>
  )
}

export default Checkout
