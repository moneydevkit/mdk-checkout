'use client'

import type { Checkout } from '@moneydevkit/api-contract'

export interface PaymentReceivedCheckoutProps {
  checkout: Checkout
  onSuccess?: (checkout: Checkout) => void
}

export default function PaymentReceivedCheckout({ checkout, onSuccess }: PaymentReceivedCheckoutProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100)
  }

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat('en-US').format(sats)
  }

  const handleContinue = () => {
    if (onSuccess) {
      onSuccess(checkout)
    } else if (checkout.successUrl) {
      window.location.href = checkout.successUrl
    }
  }

  const CheckmarkIcon = () => (
    <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )

  return (
    <>
      <div className="text-center mb-6">
        <div className="bg-green-500/20 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
          <CheckmarkIcon />
        </div>
        <p className="text-gray-300">Your payment has been received.</p>
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
              {checkout.invoice?.amountSatsReceived && `${formatSats(checkout.invoice.amountSatsReceived)} sats`}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Checkout ID:</span>
            <span className="text-white font-medium">{checkout.id}</span>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 mt-6 mb-6">
        <p>Thank you for your business!</p>
      </div>

      <div className="text-center mb-4">
        <button
          onClick={handleContinue}
          className="w-full bg-white hover:bg-gray-200 text-black font-medium py-3 px-4 rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </>
  )
}
