/**
 * Paid fetch for L402/agent payments
 *
 * Handles the L402 flow: request -> 402 response with invoice -> pay -> retry with preimage
 */

import { assertServerOnly } from './server-only'
import { getPayoutConfig } from './config'
import { payout } from './payout'
import {
  InternalError,
  InvalidAmountError,
  PerPaymentLimitExceededError,
} from './errors'
import type { PaidFetchOptions } from './types'

/**
 * Header name for invoice in 402 response
 */
const INVOICE_HEADER = 'x-lightning-invoice'

/**
 * Header name for preimage in retry request
 */
const PREIMAGE_HEADER = 'x-lightning-preimage'

/**
 * Extracts invoice from 402 response headers
 */
function extractInvoice(response: Response): string | null {
  // Check standard header
  let invoice = response.headers.get(INVOICE_HEADER)
  if (invoice) {
    return invoice
  }

  // Check WWW-Authenticate header (L402 standard)
  const wwwAuth = response.headers.get('www-authenticate')
  if (wwwAuth && wwwAuth.startsWith('L402')) {
    // Parse L402 macaroon=..., invoice=...
    const invoiceMatch = wwwAuth.match(/invoice="([^"]+)"/)
    if (invoiceMatch) {
      return invoiceMatch[1]
    }
  }

  return null
}

/**
 * Per-domain hourly limits for paid fetch
 * Prevents a single domain from draining the wallet
 */
const domainHourlySpending = new Map<string, { amount: number; timestamp: number }>()
const DOMAIN_HOURLY_LIMIT = 10_000 // 10k sats per domain per hour

/**
 * Checks domain-specific hourly limit
 */
function checkDomainLimit(url: string, amountSats: number): void {
  const domain = new URL(url).hostname
  const now = Date.now()
  const oneHourAgo = now - 60 * 60 * 1000

  const current = domainHourlySpending.get(domain)

  if (current && current.timestamp > oneHourAgo) {
    if (current.amount + amountSats > DOMAIN_HOURLY_LIMIT) {
      throw new PerPaymentLimitExceededError(
        DOMAIN_HOURLY_LIMIT - current.amount,
        amountSats,
      )
    }
  }
}

/**
 * Records spending for a domain
 */
function recordDomainSpending(url: string, amountSats: number): void {
  const domain = new URL(url).hostname
  const now = Date.now()
  const oneHourAgo = now - 60 * 60 * 1000

  const current = domainHourlySpending.get(domain)

  if (current && current.timestamp > oneHourAgo) {
    domainHourlySpending.set(domain, {
      amount: current.amount + amountSats,
      timestamp: now,
    })
  } else {
    domainHourlySpending.set(domain, {
      amount: amountSats,
      timestamp: now,
    })
  }
}

/**
 * Decodes a BOLT11 invoice to extract amount (simplified)
 * In production, use proper BOLT11 decoding
 */
function getInvoiceAmountSats(invoice: string): number | null {
  // BOLT11 invoices encode amount after 'ln' prefix
  // lnbc = mainnet, amount follows
  // This is a simplified parser - in production use proper decoding

  const lower = invoice.toLowerCase()

  // Find the amount part (after lnbc/lntb/lnbs/lnbcrt)
  let amountStr = ''
  let multiplier = 1

  // Extract numeric part after prefix
  const prefixes = ['lnbcrt', 'lnbc', 'lntb', 'lnbs']
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      const rest = lower.slice(prefix.length)
      // Amount is digits followed by optional multiplier and then '1'
      const match = rest.match(/^(\d+)([munp]?)1/)
      if (match) {
        amountStr = match[1]
        const mult = match[2]
        switch (mult) {
          case 'm':
            multiplier = 100_000_000 // milli-BTC = 100k sats
            break
          case 'u':
            multiplier = 100 // micro-BTC = 100 sats
            break
          case 'n':
            multiplier = 0.1 // nano-BTC = 0.1 sats
            break
          case 'p':
            multiplier = 0.0001 // pico-BTC = 0.0001 sats
            break
          default:
            multiplier = 100_000_000_000 // BTC = 100B sats (unlikely)
        }
      }
      break
    }
  }

  if (!amountStr) {
    return null
  }

  const amount = parseInt(amountStr, 10)
  if (isNaN(amount)) {
    return null
  }

  return Math.floor(amount * multiplier)
}

/**
 * Performs a fetch that automatically handles L402 payment flow.
 *
 * If the endpoint returns 402 with an invoice, pays the invoice and retries
 * with the preimage.
 *
 * @param url - URL to fetch
 * @param options - Fetch options including payment limits
 * @returns Response from the server after payment (if needed)
 *
 * @example
 * ```ts
 * import { paidFetch } from '@moneydevkit/payouts'
 *
 * const response = await paidFetch('https://tool.example.com/api/work', {
 *   method: 'POST',
 *   body: JSON.stringify({ query: 'hello' }),
 *   payment: { maxSats: 100 },
 * })
 *
 * const data = await response.json()
 * ```
 */
export async function paidFetch(
  url: string,
  options: PaidFetchOptions,
): Promise<Response> {
  // Server-only enforcement
  assertServerOnly()

  // Validate config
  getPayoutConfig()

  const { payment, ...fetchOptions } = options

  if (!payment || typeof payment.maxSats !== 'number') {
    throw new InvalidAmountError('payment.maxSats is required')
  }

  if (payment.maxSats <= 0) {
    throw new InvalidAmountError('payment.maxSats must be positive')
  }

  // Check domain limit before even trying
  checkDomainLimit(url, payment.maxSats)

  // First request
  const response = await fetch(url, fetchOptions)

  // If not 402, return as-is
  if (response.status !== 402) {
    return response
  }

  // Extract invoice from 402 response
  const invoice = extractInvoice(response)
  if (!invoice) {
    throw new InternalError(
      '402 response did not include invoice. Expected X-Lightning-Invoice header.',
    )
  }

  // Check invoice amount against maxSats
  const invoiceAmountSats = getInvoiceAmountSats(invoice)
  if (invoiceAmountSats !== null && invoiceAmountSats > payment.maxSats) {
    throw new PerPaymentLimitExceededError(payment.maxSats, invoiceAmountSats)
  }

  // Check domain limit with actual amount
  if (invoiceAmountSats !== null) {
    checkDomainLimit(url, invoiceAmountSats)
  }

  // Pay the invoice
  const paymentResult = await payout({
    destination: { type: 'bolt11', invoice },
    amount: invoiceAmountSats ?? payment.maxSats,
    currency: 'sats',
    idempotencyKey: `paidfetch-${url}-${Date.now()}`,
  })

  if (!paymentResult.success) {
    throw new InternalError(
      `Payment failed: ${paymentResult.error?.message ?? 'Unknown error'}`,
    )
  }

  // Record domain spending
  if (paymentResult.amountSats) {
    recordDomainSpending(url, paymentResult.amountSats)
  }

  // Retry with preimage
  const retryHeaders = new Headers(fetchOptions.headers)
  retryHeaders.set(PREIMAGE_HEADER, paymentResult.paymentId ?? '')

  return fetch(url, {
    ...fetchOptions,
    headers: retryHeaders,
  })
}

/**
 * Resets domain spending tracking (for testing)
 */
export function __resetDomainSpending(): void {
  domainHourlySpending.clear()
}
