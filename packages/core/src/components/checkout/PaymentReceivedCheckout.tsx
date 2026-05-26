import type { Checkout } from '@moneydevkit/api-contract'
import { useState } from 'react'

export interface PaymentReceivedCheckoutProps {
  checkout: Checkout
  onSuccess: (checkout: Checkout) => void
}

export default function PaymentReceivedCheckout({ checkout, onSuccess }: PaymentReceivedCheckoutProps) {
  const [idCopied, setIdCopied] = useState(false)
  const idHead = checkout.id.slice(0, 4)
  const idTail = checkout.id.slice(-4)

  const copyCheckoutId = async () => {
    try {
      await navigator.clipboard.writeText(checkout.id)
      setIdCopied(true)
      setTimeout(() => setIdCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy checkout id:', error)
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100)
  }

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(sats)
  }

  const handleContinue = () => {
    onSuccess(checkout)
  }

  const CheckmarkIcon = () => (
    <svg className="w-10 h-10 mdk-text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )

  return (
    <>
      <div className="text-center mb-6">
        <div className="mdk-status-icon-frame is-success mb-4">
          <CheckmarkIcon />
        </div>
        <p className="mdk-display mdk-glow-teal" style={{ fontSize: 'clamp(1.5rem, 3vw, 1.9rem)' }}>
          Payment received
        </p>
      </div>

      <div className="mdk-panel-inset p-4 mb-6">
        <h3 className="mdk-label text-center mb-3">› Payment Details</h3>

        <div className="space-y-2 mdk-mono" style={{ fontSize: '13px' }}>
          {(checkout.invoice?.fiatAmount || checkout.invoice?.amountSats) && (
            <div className="flex justify-between items-baseline">
              <span className="mdk-text-faint">Amount</span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.6em' }}>
                {checkout.invoice?.amountSats && (
                  <span className="mdk-text-muted">
                    {`₿${formatSats(checkout.invoice.amountSats)}`}
                  </span>
                )}
                {checkout.invoice?.fiatAmount && (
                  <span className="mdk-text-fg">
                    {formatCurrency(checkout.invoice.fiatAmount, 'USD')}
                  </span>
                )}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="mdk-text-faint">Checkout ID</span>
            <span
              className="mdk-text-muted"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', fontSize: '11px' }}
            >
              <button
                type="button"
                onClick={copyCheckoutId}
                aria-label="Copy checkout ID"
                title="Copy checkout ID"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  marginRight: '0.1em',
                  cursor: 'pointer',
                  color: idCopied ? 'var(--mdk-teal)' : 'var(--mdk-fg)',
                  width: '14px',
                  height: '14px',
                }}
              >
                {idCopied ? (
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.25} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.25} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              <span className="mdk-text-muted">{idHead}</span>
              <span
                className="mdk-text-faint"
                style={{ display: 'inline-flex', gap: '0.2em' }}
                aria-hidden="true"
              >
                <span>.</span>
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
              <span className="mdk-text-muted">{idTail}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="text-center mt-6 mb-6">
        <p className="mdk-label" style={{ lineHeight: 1.6 }}>Thank you for your&nbsp;business</p>
      </div>

      <div className="text-center mb-4">
        <button
          onClick={handleContinue}
          className="mdk-button mdk-button-primary w-full"
        >
          Continue
        </button>
      </div>
    </>
  )
}
