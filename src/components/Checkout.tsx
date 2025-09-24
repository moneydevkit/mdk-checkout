'use client'

import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import '../mdk-styles.css'
import { MdkCheckoutProvider } from '../providers'
import { getCheckout, createCheckout, type CreateCheckoutParams } from '../server/actions'
import ExpiredCheckout from './checkout/ExpiredCheckout'
import PaymentReceivedCheckout from './checkout/PaymentReceivedCheckout'
import PendingPaymentCheckout from './checkout/PendingPaymentCheckout'
import UnconfirmedCheckout from './checkout/UnconfirmedCheckout'

export interface CheckoutProps {
  id?: string
  onSuccess?: (checkout: CheckoutType) => void
  title?: string
  description?: string
  // New: creation parameters for when no id is provided
  createParams?: CreateCheckoutParams
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

function CheckoutInternal({ id, createParams, onSuccess, title, description }: CheckoutProps) {
  // First, create checkout if needed (when createParams provided but no id)
  const { data: createdCheckout, error: createError } = useQuery({
    queryKey: ['mdk-create-checkout', createParams],
    queryFn: () => createCheckout(createParams!),
    enabled: !id && !!createParams,
    staleTime: Infinity, // Don't refetch creation
  })

  // Use the provided id or the id from the created checkout
  const checkoutId = id || createdCheckout?.id

  // Then fetch/poll the checkout
  const { data: checkout } = useQuery({
    queryKey: ['mdk-checkout', checkoutId],
    queryFn: () => getCheckout(checkoutId!),
    enabled: !!checkoutId,
    refetchInterval: ({ state: { data } }) => {
      if (data?.status === 'PENDING_PAYMENT') {
        return PENDING_PAYMENT_REFETCH_INTERVAL_MS
      }
      return false
    },
    refetchIntervalInBackground: true,
  })

  // Check for successUrl in checkout metadata
  const successUrl = checkout?.userMetadata?.successUrl

  // Default onSuccess behavior: redirect to successUrl or /success
  const handleSuccess = onSuccess || (() => {
    window.location.href = successUrl || '/success'
  })

  // Handle creation errors
  if (createError) {
    return (
      <div className="flex justify-center min-h-screen p-4 pt-8 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800">
        <div className="w-full max-w-md">
          <CheckoutLayout title="Error" description="Failed to create checkout">
            <div className="text-center">
              <div className="text-red-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-300 mb-4">Unable to create checkout session</p>
              <button
                onClick={() => window.history.back()}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors"
              >
                Go Back
              </button>
            </div>
          </CheckoutLayout>
        </div>
      </div>
    )
  }

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
                    onSuccess={handleSuccess}
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

export function Checkout(props: CheckoutProps) {
  return (
    <MdkCheckoutProvider>
      <CheckoutInternal {...props} />
    </MdkCheckoutProvider>
  )
}

export default Checkout
