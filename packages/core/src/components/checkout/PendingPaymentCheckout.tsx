import type { Checkout } from '@moneydevkit/api-contract'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { clientPayInvoice } from '../../client-actions'
import { is_preview_environment } from '../../preview'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'

type PendingPaymentCheckoutType = Extract<Checkout, { status: 'PENDING_PAYMENT' }>

export interface PendingPaymentCheckoutProps {
  checkout: PendingPaymentCheckoutType
}

/**
 * Generate a deterministic fake invoice string for sandbox mode.
 * This creates a realistic-looking but clearly fake Lightning invoice.
 */
function generateSandboxInvoice(checkoutId: string, amountSats: number): string {
  // Create a fake but realistic-looking BOLT11 invoice prefix
  // Real invoices start with lnbc (mainnet) or lntb (testnet)
  // We use lnsb (sandbox) to make it clearly identifiable
  const prefix = 'lnsb'
  const amountPart = `${amountSats}n`
  // Use checkout ID to create deterministic fake data
  const hash = checkoutId.replace(/-/g, '').slice(0, 52)
  const padding = '0'.repeat(Math.max(0, 52 - hash.length))
  return `${prefix}${amountPart}1p${hash}${padding}sandbox`
}

export default function PendingPaymentCheckout({ checkout }: PendingPaymentCheckoutProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false)
  const [markingPaid, setMarkingPaid] = useState<boolean>(false)
  const [markPaidError, setMarkPaidError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const isPreview = is_preview_environment()

  // In preview mode, generate a fake invoice for display purposes
  const invoiceAmountSats = checkout.invoice?.amountSats ?? checkout.invoiceAmountSats ?? 0
  const sandboxInvoice = useMemo(
    () => generateSandboxInvoice(checkout.id, invoiceAmountSats),
    [checkout.id, invoiceAmountSats]
  )

  // Use sandbox invoice in preview mode, real invoice otherwise
  const displayInvoice = isPreview ? sandboxInvoice : (checkout.invoice?.invoice ?? '')
  useEffect(() => {
    // In preview mode, don't show expiry timer since the invoice is fake
    if (isPreview) {
      setTimeRemaining('')
      return
    }

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
  }, [checkout.invoice?.expiresAt, isPreview])

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100)
  }

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat('en-US').format(sats)
  }

  const copyToClipboard = async () => {
    if (displayInvoice) {
      try {
        await navigator.clipboard.writeText(displayInvoice)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch (error) {
        console.error('Failed to copy invoice:', error)
      }
    }
  }

  const truncateInvoice = (invoice: string, maxLength = 40) => {
    if (invoice.length <= maxLength) return invoice
    const start = Math.floor((maxLength - 3) / 2)
    const end = Math.ceil((maxLength - 3) / 2)
    return `${invoice.slice(0, start)}...${invoice.slice(-end)}`
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

  const SandboxBanner = () => (
    <div className="mb-4 p-3 bg-amber-900/30 border border-amber-600/50 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-amber-400 font-medium text-sm">Sandbox Mode</span>
      </div>
      <p className="text-amber-200/80 text-xs leading-relaxed">
        This is a demo QR code. Real payments require deploying your app to a stable URL.
      </p>
    </div>
  )

  return (
    <>
      {isPreview && <SandboxBanner />}

      <div className="text-center mb-6 w-full">
        <div className="mb-4 w-full">
          <div className="text-2xl font-semibold mb-2 font-sans tracking-tight">
            {invoiceAmountSats > 0 && `${formatSats(invoiceAmountSats)} sats`}
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
                {!isPreview && (
                  <>
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
                  </>
                )}
                {isPreview && (
                  <div className="flex justify-between w-full">
                    <span className="text-gray-400">Mode</span>
                    <span className="text-amber-400">Sandbox (Demo)</span>
                  </div>
                )}
                {timeRemaining && !isPreview && (
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

      <div className="flex justify-center mb-4 w-full relative">
        <div
          className={`bg-white p-3 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow ${isPreview ? 'ring-2 ring-amber-500/50' : ''}`}
          onClick={copyToClipboard}
          title={isPreview ? 'Demo QR code - click to copy' : 'Click to copy invoice'}
        >
          <QRCodeSVG
            value={displayInvoice}
            size={320}
            bgColor="#ffffff"
            fgColor={isPreview ? '#78350f' : '#000000'}
            level="Q"
          />
        </div>
        {isPreview && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-xs font-medium px-2 py-0.5 rounded">
            DEMO
          </div>
        )}
      </div>

      {displayInvoice && (
        <div className={`flex items-center gap-2 mb-6 p-3 rounded-lg w-full ${isPreview ? 'bg-amber-900/20 border border-amber-600/30' : 'bg-gray-700'}`}>
          <code className={`text-xs font-mono flex-1 text-center min-w-0 ${isPreview ? 'text-amber-200/70' : 'text-gray-300'}`}>
            {truncateInvoice(displayInvoice)}
          </code>
          <div onClick={copyToClipboard} title="Copy invoice" className="flex-shrink-0">
            {copySuccess ? <CheckmarkIcon /> : <CopyIcon />}
          </div>
        </div>
      )}

      {isPreview && paymentHash && invoiceAmountSats && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Button
            onClick={handleMarkAsPaid}
            disabled={markingPaid}
            className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
          >
            {markingPaid ? 'Simulating payment...' : 'Simulate Payment'}
          </Button>
          {markPaidError && (
            <p className="text-red-400 text-xs text-center">{markPaidError}</p>
          )}
          <p className="text-gray-500 text-xs text-center mt-1">
            Click to simulate a successful payment in sandbox mode
          </p>
        </div>
      )}
    </>
  )
}
