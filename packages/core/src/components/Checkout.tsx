import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import { useQuery } from '@tanstack/react-query'
import { ReactNode, useCallback, useEffect, useState } from 'react'
import { CHECKOUT_ID_QUERY_PARAM } from '../constants'
import '../mdk-styles.css'
import { clientCreateCheckout, clientGetCheckout } from '../client-actions'
import { log } from '../logging'
import { MdkCheckoutProvider } from '../providers'
import ExpiredCheckout from './checkout/ExpiredCheckout'
import PaymentReceivedCheckout from './checkout/PaymentReceivedCheckout'
import PendingPaymentCheckout from './checkout/PendingPaymentCheckout'
import UnconfirmedCheckout from './checkout/UnconfirmedCheckout'

const POLLING_STATUSES = new Set<CheckoutType['status']>(['UNCONFIRMED', 'CONFIRMED', 'PENDING_PAYMENT'])

export interface CheckoutProps {
  id?: string
}

interface CheckoutLayoutProps {
  checkout?: CheckoutType
  children: ReactNode
}

function CheckoutLayout({ checkout, children }: CheckoutLayoutProps) {
  const title = checkout?.userMetadata?.title
  const description = checkout?.userMetadata?.description
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

interface CheckoutUrlError {
  code: string
  message: string
}

function CheckoutError({ error }: { error: CheckoutUrlError }) {
  return (
    <div className="flex justify-center min-h-screen p-4 pt-8 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800">
      <div className="w-full max-w-md">
        <div className="w-fit mx-auto" style={{ width: '380px' }}>
          <div className="bg-gray-800 rounded-2xl p-6 text-white font-sans">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2">Unable to create checkout</h2>
              <p className="text-gray-400">{error.message}</p>
            </div>
          </div>
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
      </div>
    </div>
  )
}

// Check for error params synchronously (before useQuery runs)
function getErrorFromUrl(): CheckoutUrlError | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const errorCode = params.get('error')
  const errorMessage = params.get('message')

  if (errorCode) {
    return {
      code: errorCode,
      message: errorMessage ?? 'An error occurred while creating the checkout.',
    }
  }
  return null
}

function CheckoutInternal({ id }: CheckoutProps) {
  // Initialize error state synchronously to prevent query from running
  const [errorFromUrl] = useState<CheckoutUrlError | null>(getErrorFromUrl)
  const [isWindowVisible, setIsWindowVisible] = useState(() => {
    if (typeof document === 'undefined') {
      return true
    }
    return document.visibilityState === 'visible'
  })
  const [isRestarting, setIsRestarting] = useState(false)

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    const handleVisibility = () => {
      setIsWindowVisible(document.visibilityState === 'visible')
    }

    const handlePageHide = () => {
      setIsWindowVisible(false)
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  const { data: checkout } = useQuery({
    queryKey: ['mdk-checkout', id],
    queryFn: () => clientGetCheckout(id!).then((checkout) => checkout as CheckoutType | undefined),
    enabled: !!id && !errorFromUrl,
    refetchInterval: ({ state: { data } }) => {
      if (!isWindowVisible) {
        return false
      }

      if (!data) {
        return 1000
      }

      const invoiceSettled = (data.invoice?.amountSatsReceived ?? 0) > 0

      if (!POLLING_STATUSES.has(data.status) || invoiceSettled) {
        return false
      }

      return 1000
    },
  })

  const paymentReceived =
    checkout?.status === 'PAYMENT_RECEIVED' ||
    (checkout?.invoice?.amountSatsReceived ?? 0) > 0

  const handleSuccess = useCallback((paidCheckout: CheckoutType) => {
    if (typeof window === 'undefined') {
      return
    }

    const configuredSuccessUrl = (paidCheckout.userMetadata?.successUrl as string) ?? paidCheckout.successUrl ?? '/success'
    let destination = configuredSuccessUrl

    try {
      const successUrl = new URL(configuredSuccessUrl, window.location.origin)
      successUrl.searchParams.set(CHECKOUT_ID_QUERY_PARAM, paidCheckout.id)
      destination = successUrl.toString()
    } catch (error) {
      log('Failed to generate checkout success URL, falling back to provided path.', error)
    }

    window.location.href = destination
  }, [])

  const handleRestart = useCallback(async () => {
    if (!checkout) return

    const amount = checkout.currency === 'SAT'
      ? checkout.invoiceAmountSats ?? checkout.netAmount ?? checkout.providedAmount ?? checkout.totalAmount
      : checkout.providedAmount ?? checkout.totalAmount ?? checkout.netAmount ?? checkout.invoice?.fiatAmount

    if (!amount) {
      window.location.reload()
      return
    }

    const checkoutPath = typeof window !== 'undefined'
      ? window.location.pathname.split('/').slice(0, -1).join('/') || '/checkout'
      : '/checkout'

    setIsRestarting(true)

    const result = await clientCreateCheckout({
      type: 'AMOUNT',
      title: (checkout.userMetadata?.title as string) || 'Checkout',
      description: (checkout.userMetadata?.description as string) || '',
      amount,
      currency: checkout.currency as 'USD' | 'SAT',
      successUrl: (checkout.userMetadata?.successUrl as string) ?? checkout.successUrl ?? undefined,
      metadata: checkout.userMetadata ?? undefined,
    })

    if (result.error) {
      console.error('Failed to restart checkout', result.error)
      setIsRestarting(false)
      return
    }

    window.location.href = `${checkoutPath}/${result.data.id}`
  }, [checkout])

  // Show error UI if there was an error from URL-based checkout creation
  if (errorFromUrl) {
    return <CheckoutError error={errorFromUrl} />
  }

  // Show error if no checkout ID provided
  if (!id) {
    return (
      <CheckoutError
        error={{
          code: 'missing_id',
          message: 'No checkout ID provided.',
        }}
      />
    )
  }

  if (!checkout) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    )
  }

  return (
    <div className="flex justify-center min-h-screen p-4 pt-8 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800">
      <div className="w-full max-w-md">
        {(() => {
          if (paymentReceived) {
            return (
              <CheckoutLayout checkout={checkout}>
                <PaymentReceivedCheckout checkout={checkout} onSuccess={handleSuccess} />
              </CheckoutLayout>
            )
          }

          switch (checkout.status) {
            case 'UNCONFIRMED':
              return (
                <CheckoutLayout checkout={checkout}>
                  <UnconfirmedCheckout checkout={checkout as Extract<CheckoutType, { status: 'UNCONFIRMED' }>} />
                </CheckoutLayout>
              )
            case 'CONFIRMED':
              return (
                <CheckoutLayout checkout={checkout}>
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
                    <p className="text-gray-300">Generating invoice...</p>
                  </div>
                </CheckoutLayout>
              )
            case 'PENDING_PAYMENT':
              return (
                <CheckoutLayout checkout={checkout}>
                  <PendingPaymentCheckout checkout={checkout as Extract<CheckoutType, { status: 'PENDING_PAYMENT' }>} />
                </CheckoutLayout>
              )
            case 'EXPIRED':
              return (
                <CheckoutLayout checkout={checkout}>
                  <ExpiredCheckout
                    checkout={checkout as Extract<CheckoutType, { status: 'EXPIRED' }>}
                    onRestart={handleRestart}
                    isRestarting={isRestarting}
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
