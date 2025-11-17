'use client'

import type { Checkout } from '@moneydevkit/api-contract'
import { ChevronDown } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'

type PendingPaymentCheckoutType = Extract<Checkout, { status: 'PENDING_PAYMENT' }>

export interface PendingPaymentCheckoutProps {
  checkout: PendingPaymentCheckoutType
}

export default function PendingPaymentCheckout({ checkout }: PendingPaymentCheckoutProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false)

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

  const copyToClipboard = async () => {
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

  return (
    <>
      <div className="text-center mb-6 w-full">
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
          className="bg-white p-3 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow"
          onClick={copyToClipboard}
          title="Click to copy invoice"
        >
          <QRCodeSVG
            value={checkout.invoice?.invoice ?? ''}
            size={320}
            bgColor="#ffffff"
            fgColor="#000000"
            level="Q"
          />
        </div>
      </div>

      {checkout.invoice?.invoice && (
        <div className="flex items-center gap-2 mb-6 bg-gray-700 p-3 rounded-lg w-full">
          <code className="text-xs text-gray-300 font-mono flex-1 text-center min-w-0">
            {truncateInvoice(checkout.invoice.invoice)}
          </code>
          <div onClick={copyToClipboard} title="Copy invoice" className="flex-shrink-0">
            {copySuccess ? <CheckmarkIcon /> : <CopyIcon />}
          </div>
        </div>
      )}
    </>
  )
}
