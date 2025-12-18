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
  id: string
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

function CheckoutInternal({ id }: CheckoutProps) {
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
    enabled: !!id,
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

    const configuredSuccessUrl = paidCheckout.successUrl ?? '/success'
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

    try {
      setIsRestarting(true)

      const newCheckout = await clientCreateCheckout({
        title: (checkout.userMetadata?.title as string) || 'Checkout',
        description: (checkout.userMetadata?.description as string) || '',
        amount,
        currency: checkout.currency as 'USD' | 'SAT',
        successUrl: checkout.successUrl ?? undefined,
        metadata: checkout.userMetadata ?? undefined,
      })

      window.location.href = `${checkoutPath}/${newCheckout.id}`
    } catch (error) {
      console.error('Failed to restart checkout', error)
      setIsRestarting(false)
    }
  }, [checkout])

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
