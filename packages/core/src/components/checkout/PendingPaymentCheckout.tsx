import type { Checkout } from '@moneydevkit/api-contract'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatInterval } from '../../checkout-utils'
import { clientPayInvoice } from '../../client-actions'
import { is_preview_environment } from '../../preview'
import { StyledQRCode } from '../StyledQRCode'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { CashAppIcon, StrikeIcon } from '../WalletIcons'

type PendingPaymentCheckoutType = Extract<Checkout, { status: 'PENDING_PAYMENT' }>

// Single BOLT11-shaped placeholder used everywhere the sandbox UX surfaces a
// payment string (QR value, wallet deep-link URLs, chunked display). Shaped
// like a real invoice so the UI looks normal, but the HRP and body are
// deliberately invalid — wallets reject decode, no HTLC can route. Keep this
// in sync visually with mdk.com's APP_HEALTH_CONFIG.sandboxPlaceholderInvoice
// (the server stores its own internal-flag string; the FE renders this one).
const SANDBOX_PLACEHOLDER_INVOICE = 'lnbcsandbox1pnxxxsandboxonlyxxxnotpayablexxxyyyzzz'

export interface PendingPaymentCheckoutProps {
  checkout: PendingPaymentCheckoutType
}

export default function PendingPaymentCheckout({ checkout }: PendingPaymentCheckoutProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [copyFlashKey, setCopyFlashKey] = useState<number>(0)
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false)
  const [markingPaid, setMarkingPaid] = useState<boolean>(false)
  const [markPaidError, setMarkPaidError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  // Render sandbox UX (placeholder QR, Mark-as-Paid button, emptied E2E data
  // attributes) when either the merchant runtime is preview (Replit dev,
  // MDK_PREVIEW=true) or the checkout is server-stamped sandbox
  // (App.mode='sandbox', even in a prod runtime).
  const showSandbox = is_preview_environment() || checkout.sandbox === true
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
      return `₿${formatSats(price.priceAmount)}`
    }
    // USD - stored in cents
    return formatCurrency(price.priceAmount, price.currency)
  }

  const copyToClipboard = async () => {
    // Don't copy real invoice in preview mode
    if (showSandbox) {
      setCopySuccess(true)
      setCopyFlashKey((k) => k + 1)
      setTimeout(() => setCopySuccess(false), 2000)
      return
    }
    if (checkout.invoice?.invoice) {
      try {
        await navigator.clipboard.writeText(checkout.invoice.invoice)
        setCopySuccess(true)
        setCopyFlashKey((k) => k + 1)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch (error) {
        console.error('Failed to copy invoice:', error)
      }
    }
  }

  const CopyIcon = () => (
    <svg
      className="w-4 h-4 mdk-text-muted cursor-pointer transition-colors"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      style={{ transition: 'color 200ms' }}
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
    if (!showSandbox || !paymentHash || !invoiceAmountSats) {
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
  }, [checkout.id, invoiceAmountSats, showSandbox, paymentHash, queryClient])

  const CheckmarkIcon = () => (
    <svg
      className="w-4 h-4 mdk-text-teal cursor-pointer transition-colors"
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
      <div className="text-center mb-3 w-full">
        {/* Subscription product info - shown prominently for recurring products */}
        {hasRecurringProduct && recurringProduct && (
          <div className="mb-5 px-2">
            <h3 className="mdk-title mb-2" style={{ fontSize: '1.15rem' }}>
              {recurringProduct.name}
            </h3>

            <div className="inline-flex items-center gap-2 mb-2">
              <span className="mdk-label" style={{ color: 'var(--mdk-teal)' }}>
                › {formatInterval(recurringProduct.recurringInterval, 'label')} subscription
              </span>
            </div>

            {recurringProduct.description && (
              <p className="mdk-body mdk-text-muted mb-3 max-w-xs mx-auto" style={{ fontSize: '14px' }}>
                {recurringProduct.description}
              </p>
            )}

            <p className="mdk-text-faint mb-4" style={{ fontSize: '12px' }}>
              You'll receive a renewal email before each billing period.
            </p>
          </div>
        )}

        {/* Amount display */}
        {(() => {
          const isFiatPriced = checkout.currency === 'USD'
          const fiatAmount = checkout.invoice?.fiatAmount
          const sats = checkout.invoice?.amountSats
          const headline = isFiatPriced && fiatAmount != null
            ? formatCurrency(fiatAmount, 'USD')
            : sats != null
              ? `₿${formatSats(sats)}`
              : null
          const fiatSecondary = !isFiatPriced && fiatAmount != null
            ? formatCurrency(fiatAmount, 'USD')
            : null
          return (
            <div
              className="mb-2 w-full"
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'center',
                gap: '1.5rem',
                flexWrap: 'wrap',
              }}
            >
              {headline && (
                <span
                  className="mdk-display mdk-glow-teal"
                  style={{ fontSize: 'clamp(2rem, 5vw, 2.6rem)' }}
                >
                  {headline}
                </span>
              )}
              {fiatSecondary && (
                <span
                  className="mdk-display"
                  style={{
                    fontSize: 'clamp(2rem, 5vw, 2.6rem)',
                    fontWeight: 300,
                    color: 'var(--mdk-faint)',
                  }}
                >
                  {fiatSecondary}
                </span>
              )}
            </div>
          )
        })()}

      </div>

      <div className="mb-4 w-full">
        <div
          className="mdk-qr-frame cursor-pointer transition-shadow relative w-full"
          onClick={copyToClipboard}
          title="Click to copy invoice"
        >
          <StyledQRCode
            value={showSandbox ? SANDBOX_PLACEHOLDER_INVOICE : (checkout.invoice?.invoice ?? '')}
            size={240}
          />
          {copyFlashKey > 0 && (
            <div
              key={copyFlashKey}
              className="mdk-qr-flash"
              aria-hidden="true"
            />
          )}
          {showSandbox && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="mdk-label px-4 py-2 transform -rotate-12"
                style={{
                  background: 'var(--mdk-bg)',
                  color: 'var(--mdk-teal)',
                  border: '1px solid var(--mdk-teal)',
                  opacity: 0.95,
                  fontSize: '14px',
                }}
              >
                › Sandbox
              </div>
            </div>
          )}
        </div>
      </div>

      {(() => {
        const invoiceString = showSandbox
          ? SANDBOX_PLACEHOLDER_INVOICE
          : checkout.invoice?.invoice
        if (!invoiceString) return null
        return (
          <div className="flex flex-col gap-2 mb-2 w-full">
            <a
              href={`https://cash.app/launch/lightning/${invoiceString}`}
              className="mdk-wallet-button mdk-wallet-button-cashapp"
            >
              <CashAppIcon className="mdk-wallet-icon" />
              <span>Pay with Cash App</span>
            </a>
            <a
              href={`strike:${invoiceString}`}
              className="mdk-wallet-button mdk-wallet-button-strike"
            >
              <StrikeIcon className="mdk-wallet-icon" />
              <span>Pay with Strike</span>
            </a>
          </div>
        )
      })()}

      {(checkout.invoice?.invoice || showSandbox) && (() => {
        const displayInvoice = showSandbox
          ? SANDBOX_PLACEHOLDER_INVOICE
          : (checkout.invoice?.invoice ?? '')
        // Chunk display: [first 4 teal] [next 4 muted] … [pre-last 4 muted] [last 4 teal]
        // Pulling the trailing chunks from the END of the string guarantees each is exactly
        // 4 chars regardless of total length, so we never end up with a 1/2/3-char tail.
        const showChunks = displayInvoice.length >= 16
        const firstChunk = displayInvoice.slice(0, 4)
        const secondChunk = displayInvoice.slice(4, 8)
        const thirdChunk = displayInvoice.slice(-8, -4)
        const fourthChunk = displayInvoice.slice(-4)
        return (
          <div
            className="mdk-panel-inset flex items-center gap-2 mb-2 w-full"
            style={{ padding: '0.75rem 1rem' }}
            data-lightning-invoice={showSandbox ? '' : (checkout.invoice?.invoice ?? '')}
            data-lightning-amount-sats={showSandbox ? '' : (invoiceAmountSats ?? '')}
            data-lightning-currency={showSandbox ? '' : (checkout.currency ?? '')}
          >
            <code
              className="mdk-mono mdk-text-muted flex-1 min-w-0 overflow-hidden whitespace-nowrap"
              style={{
                fontSize: '12px',
                display: showChunks ? 'flex' : undefined,
                justifyContent: showChunks ? 'space-between' : undefined,
                alignItems: 'baseline',
              }}
            >
              {showChunks ? (
                <>
                  <span className="mdk-text-teal">{firstChunk}</span>
                  <span className="mdk-text-muted">{secondChunk}</span>
                  <span
                    className="mdk-text-muted"
                    style={{ display: 'inline-flex', gap: '0.25em' }}
                    aria-hidden="true"
                  >
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                  <span className="mdk-text-muted">{thirdChunk}</span>
                  <span className="mdk-text-teal">{fourthChunk}</span>
                </>
              ) : (
                displayInvoice
              )}
            </code>
            <div onClick={copyToClipboard} title="Copy invoice" className="flex-shrink-0">
              {copySuccess ? <CheckmarkIcon /> : <CopyIcon />}
            </div>
          </div>
        )
      })()}

      <div className="w-full mt-2">
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger
            className="mdk-label flex items-center justify-center gap-1.5 w-full transition-colors"
            style={{ fontSize: '11px' }}
          >
            View Details
            <ChevronDown
              className={`w-2.5 h-2.5 transition-transform duration-300 ease-in-out ${detailsOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--mdk-teal)' }}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="w-full overflow-hidden transition-all duration-300 ease-in-out data-[state=closed]:animate-[collapsible-up_300ms_ease-in-out] data-[state=open]:animate-[collapsible-down_300ms_ease-in-out]">
            <div className="mt-4 space-y-3 w-full mdk-mono" style={{ fontSize: '13px' }}>
              {hasProducts && checkout.products!.map((product) => {
                const price = product.prices?.[0]
                return (
                  <div key={product.id} className="flex justify-between w-full">
                    <span className="mdk-text-faint">{product.name}</span>
                    <span className="mdk-text-fg">
                      {price && formatProductPrice(price)}
                      {product.recurringInterval && (
                        <span className="mdk-text-faint">{formatInterval(product.recurringInterval, 'short')}</span>
                      )}
                    </span>
                  </div>
                )
              })}
              {hasProducts && <div className="mdk-divider my-2" />}
              {checkout.currency === 'USD' ? (
                <div className="flex justify-between w-full">
                  <span className="mdk-text-faint">Amount (₿)</span>
                  <span className="mdk-text-fg">
                    {checkout.invoice?.amountSats != null &&
                      `₿${formatSats(checkout.invoice.amountSats)}`}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between w-full">
                  <span className="mdk-text-faint">Total Fiat</span>
                  <span className="mdk-text-fg">
                    {checkout.invoice?.fiatAmount != null &&
                      formatCurrency(checkout.invoice.fiatAmount, 'USD')}
                  </span>
                </div>
              )}
              <div className="flex justify-between w-full">
                <span className="mdk-text-faint">Exchange Rate</span>
                <span className="mdk-text-fg">
                  {checkout.invoice?.btcPrice && `$${new Intl.NumberFormat('en-US').format(checkout.invoice.btcPrice)}`}
                </span>
              </div>
              {timeRemaining && (
                <div className="flex justify-between w-full">
                  <span className="mdk-text-faint">Expires in</span>
                  <span className="mdk-text-teal">{timeRemaining}</span>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Mark-as-Paid button gates on is_preview_environment() — narrower than
          `showSandbox` — because the underlying chain
          clientPayInvoice → /pay_invoice → markInvoicePaidPreview is preview-only
          (see actions.ts / client-actions.ts). Rendering it on a prod-runtime
          sandbox checkout would surface a button whose click always throws.
          Visual sandbox cues (placeholder QR, banner) still use `showSandbox`. */}
      {is_preview_environment() && paymentHash && invoiceAmountSats && (
        <div className="mt-4 flex flex-col items-center">
          <button
            type="button"
            onClick={handleMarkAsPaid}
            disabled={markingPaid}
            className="mdk-button mdk-button-primary"
          >
            {markingPaid ? 'Marking as paid…' : 'Mark as Paid (Sandbox)'}
          </button>
          {markPaidError && (
            <p className="mdk-text-amber text-center mt-2" style={{ fontSize: '12px' }}>{markPaidError}</p>
          )}
        </div>
      )}
    </>
  )
}
