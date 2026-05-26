import type { Checkout } from '@moneydevkit/api-contract'

type ExpiredCheckoutType = Extract<Checkout, { status: 'EXPIRED' }>

export interface ExpiredCheckoutProps {
  checkout: ExpiredCheckoutType
  onRestart?: () => void
  isRestarting?: boolean
}

export default function ExpiredCheckout({ checkout, onRestart, isRestarting = false }: ExpiredCheckoutProps) {
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
    <svg className="w-10 h-10 mdk-text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
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
        <div className="mdk-status-icon-frame is-error mb-4">
          <ClockIcon />
        </div>

        <p className="mdk-body mdk-text-muted" style={{ fontWeight: 300 }}>This checkout session has expired.</p>
      </div>

      <div className="mdk-panel-inset p-4 mb-6">
        <h3 className="mdk-label text-center mb-3">› Payment Details</h3>

        <div className="space-y-2 mdk-mono" style={{ fontSize: '13px' }}>
          <div className="flex justify-between">
            <span className="mdk-text-faint">Amount Fiat:</span>
            <span className="mdk-text-fg">
              {checkout.invoice?.fiatAmount && checkout.currency &&
                formatCurrency(checkout.invoice.fiatAmount, checkout.currency)}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="mdk-text-faint">Amount (₿):</span>
            <span className="mdk-text-fg">
              {checkout.invoice?.amountSats && `₿${formatSats(checkout.invoice.amountSats)}`}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="mdk-text-faint">Checkout ID:</span>
            <span className="mdk-text-fg" style={{ wordBreak: 'break-all', textAlign: 'right' }}>{checkout.id}</span>
          </div>
        </div>
      </div>

      <div className="text-center mb-6">
        <p className="mdk-body mdk-text-muted" style={{ fontSize: '14px' }}>Checkout sessions only last 15 minutes. Please restart the flow to proceed.</p>
      </div>

      <button
        onClick={handleRestart}
        disabled={isRestarting}
        className="mdk-button mdk-button-primary w-full"
      >
        {isRestarting ? 'Restarting…' : 'Restart'}
      </button>
    </>
  )
}
