import type { Checkout } from '@moneydevkit/api-contract'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState } from 'react'
import { formatInterval } from '../../checkout-utils'
import { clientPayInvoice } from '../../client-actions'
import { is_preview_environment } from '../../preview'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'

type PendingPaymentCheckoutType = Extract<Checkout, { status: 'PENDING_PAYMENT' }>

export interface PendingPaymentCheckoutProps {
  checkout: PendingPaymentCheckoutType
}

export default function PendingPaymentCheckout({ checkout }: PendingPaymentCheckoutProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false)
  const [markingPaid, setMarkingPaid] = useState<boolean>(false)
  const [markPaidError, setMarkPaidError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const isPreview = is_preview_environment()
  useEffect(() => {
    const updateTimer = () => {
      if (!checkout.invoice?.expiresAt) return

      const now = new Date().getTime()
      const expiry = new Date(checkout.invoice.expiresAt).getTime()
      const diff = expiry - now

      if (diff <= 0) {
        setTimeRemaining('Expired')
        return
      }

      const minutes = Math.floor(diff / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [checkout.invoice?.expiresAt])

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100)
  }

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat('en-US').format(sats)
  }

  const formatProductPrice = (price: { amountType: string; priceAmount: number | null; currency: string }) => {
    if (price.amountType === 'FREE') return 'Free'
    if (price.amountType === 'CUSTOM') return 'Custom'
    if (price.priceAmount === null) return ''

    if (price.currency === 'SAT') {
      return `${formatSats(price.priceAmount)} sats`
    }
    // USD - stored in cents
    return formatCurrency(price.priceAmount, price.currency)
  }

  const copyToClipboard = async () => {
    // Don't copy real invoice in preview mode
    if (isPreview) {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
      return
    }
    if (checkout.invoice?.invoice) {
      try {
        await navigator.clipboard.writeText(checkout.invoice.invoice)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch (error) {
        console.error('Failed to copy invoice:', error)
      }
    }
  }

  const CopyIcon = () => (
    <svg
      className="w-4 h-4 text-gray-400 hover:text-white cursor-pointer transition-colors"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  )

  const invoiceAmountSats = checkout.invoice?.amountSats ?? checkout.invoiceAmountSats ?? null
  const paymentHash = checkout.invoice?.paymentHash

  const handleMarkAsPaid = useCallback(async () => {
    if (!isPreview || !paymentHash || !invoiceAmountSats) {
      setMarkPaidError('Missing invoice details for preview payment.')
      return
    }

    try {
      setMarkPaidError(null)
      setMarkingPaid(true)
      await clientPayInvoice(paymentHash, invoiceAmountSats)
      await queryClient.invalidateQueries({ queryKey: ['mdk-checkout', checkout.id] })
    } catch (error) {
      console.error('Failed to mark invoice as paid', error)
      setMarkPaidError('Failed to mark as paid. Please try again.')
    } finally {
      setMarkingPaid(false)
    }
  }, [checkout.id, invoiceAmountSats, isPreview, paymentHash, queryClient])

  const CheckmarkIcon = () => (
    <svg
      className="w-4 h-4 text-green-500 cursor-pointer transition-colors"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )

  const hasProducts = checkout.products && checkout.products.length > 0

  // Check if checkout has recurring products
  const recurringProduct = checkout.products?.find(p => p.recurringInterval)
  const hasRecurringProduct = !!recurringProduct

  return (
    <>
      <div className="text-center mb-6 w-full">
        {/* Subscription product info - shown prominently for recurring products */}
        {hasRecurringProduct && recurringProduct && (
          <div className="mb-5 px-2">
            {/* Product name */}
            <h3 className="text-lg font-medium text-white mb-2">
              {recurringProduct.name}
            </h3>

            {/* Billing interval badge */}
            <div className="inline-flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                {formatInterval(recurringProduct.recurringInterval, 'label')} subscription
              </span>
            </div>

            {/* Product description */}
            {recurringProduct.description && (
              <p className="text-sm text-gray-400 mb-3 max-w-xs mx-auto">
                {recurringProduct.description}
              </p>
            )}

            {/* Email reminder - subtle helper text */}
            <p className="text-xs text-gray-500 mb-4">
              You'll receive a renewal email before each billing period.
            </p>
          </div>
        )}

        {/* Amount display */}
        <div className="mb-4 w-full">
          <div className="text-2xl font-semibold mb-2 font-sans tracking-tight">
            {checkout.invoice?.amountSats && `${formatSats(checkout.invoice.amountSats)} sats`}
          </div>
        </div>

        <div className="w-full">
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger className="flex items-center justify-center gap-2 text-gray-400 hover:text-white transition-colors text-sm w-full font-medium">
              View Details
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ease-in-out ${detailsOpen ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="w-full overflow-hidden transition-all duration-300 ease-in-out data-[state=closed]:animate-[collapsible-up_300ms_ease-in-out] data-[state=open]:animate-[collapsible-down_300ms_ease-in-out]">
              <div className="mt-4 space-y-3 text-sm w-full">
                {/* Product line items */}
                {hasProducts && checkout.products!.map((product) => {
                  const price = product.prices?.[0]
                  return (
                    <div key={product.id} className="flex justify-between w-full">
                      <span className="text-gray-400">{product.name}</span>
                      <span className="text-white">
                        {price && formatProductPrice(price)}
                        {product.recurringInterval && (
                          <span className="text-gray-400">{formatInterval(product.recurringInterval, 'short')}</span>
                        )}
                      </span>
                    </div>
                  )
                })}
                {/* Separator after products */}
                {hasProducts && <div className="border-t border-gray-600 my-2" />}
                <div className="flex justify-between w-full">
                  <span className="text-gray-400">Total Fiat</span>
                  <span className="text-white">
                    {checkout.invoice?.fiatAmount && checkout.currency &&
                      formatCurrency(checkout.invoice.fiatAmount, checkout.currency)}
                  </span>
                </div>
                <div className="flex justify-between w-full">
                  <span className="text-gray-400">Exchange Rate</span>
                  <span className="text-white">
                    {checkout.invoice?.btcPrice && `$${new Intl.NumberFormat('en-US').format(checkout.invoice.btcPrice)}`}
                  </span>
                </div>
                {timeRemaining && (
                  <div className="flex justify-between w-full">
                    <span className="text-gray-400">Expires in</span>
                    <span className="text-white">{timeRemaining}</span>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="flex justify-center mb-4 w-full">
        <div
          className="bg-white p-3 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow relative"
          onClick={copyToClipboard}
          title="Click to copy invoice"
        >
          <QRCodeSVG
            value={isPreview ? 'SANDBOX_PREVIEW_MODE' : (checkout.invoice?.invoice ?? '')}
            size={320}
            bgColor="#ffffff"
            fgColor="#000000"
            level="Q"
          />
          {isPreview && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="text-white font-bold text-lg px-4 py-2 rounded transform -rotate-12 shadow-lg"
                style={{ backgroundColor: '#475569', opacity: 0.95 }}
              >
                SANDBOX
              </div>
            </div>
          )}
        </div>
      </div>

      {(checkout.invoice?.invoice || isPreview) && (
        <div
          className="flex items-center gap-2 mb-6 bg-gray-700 p-3 rounded-lg w-full"
          data-lightning-invoice={isPreview ? '' : (checkout.invoice?.invoice ?? '')}
          data-lightning-amount-sats={isPreview ? '' : (invoiceAmountSats ?? '')}
          data-lightning-currency={isPreview ? '' : (checkout.currency ?? '')}
        >
          <code className="text-xs text-gray-300 font-mono flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {isPreview
              ? 'lnbc1500n1pnxxx...sandbox_invoice...xxxyyyzzz'
              : (checkout.invoice?.invoice ?? '')}
          </code>
          <div onClick={copyToClipboard} title="Copy invoice" className="flex-shrink-0">
            {copySuccess ? <CheckmarkIcon /> : <CopyIcon />}
          </div>
        </div>
      )}

      {isPreview && paymentHash && invoiceAmountSats && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={handleMarkAsPaid}
            disabled={markingPaid}
            className="bg-gray-700 hover:bg-gray-900 text-gray-300"
          >
            {markingPaid ? 'Marking as paid...' : 'Mark as Paid (Sandbox)'}
          </Button>
          {markPaidError && (
            <p className="text-red-400 text-xs text-center mt-2">{markPaidError}</p>
          )}
        </div>
      )}
    </>
  )
}
