'use client'

import type { Checkout } from '@moneydevkit/api-contract'

type ExpiredCheckoutType = Extract<Checkout, { status: 'EXPIRED' }>

export interface ExpiredCheckoutProps {
  checkout: ExpiredCheckoutType
  onRestart?: () => void
}

export default function ExpiredCheckout({ checkout, onRestart }: ExpiredCheckoutProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100)
  }

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat('en-US').format(sats)
  }

  const ClockIcon = () => (
    <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  )

  const handleRestart = () => {
    if (onRestart) {
      onRestart()
    } else {
      window.location.reload()
    }
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="bg-red-500/20 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
          <ClockIcon />
        </div>

        <p className="text-gray-300">This checkout session has expired.</p>
      </div>

      <div className="bg-gray-700 rounded-lg p-4 mb-6">
        <h3 className="text-sm text-center font-bold text-gray-300 mb-3">Payment Details</h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Amount Fiat:</span>
            <span className="text-white font-medium">
              {checkout.invoice?.fiatAmount && checkout.currency &&
                formatCurrency(checkout.invoice.fiatAmount, checkout.currency)}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Amount BTC:</span>
            <span className="text-white font-medium">
              {checkout.invoice?.amountSats && `${formatSats(checkout.invoice.amountSats)} sats`}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Checkout ID:</span>
            <span className="text-white font-medium">{checkout.id}</span>
          </div>
        </div>
      </div>

      <div className="text-center mb-6">
        <p className="text-gray-300">Checkout sessions only last 15 minutes. Please restart the flow to proceed.</p>
      </div>

      <button
        onClick={handleRestart}
        className="w-full bg-white hover:bg-gray-100 text-gray-900 font-medium py-3 px-4 rounded-lg transition-colors"
      >
        Restart
      </button>
    </>
  )
}
