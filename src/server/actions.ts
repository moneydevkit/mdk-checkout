'use server'

import type { ConfirmCheckout } from '@moneydevkit/api-contract'
import { log } from './logging'
import { getMoneyDevKit } from './mdk'
import { hasPaymentBeenReceived, markPaymentReceived } from './payment-state'

export async function getCheckout(checkoutId: string) {
  const mdk = getMoneyDevKit()
  return await mdk.checkouts.get({ id: checkoutId })
}

export async function confirmCheckout(confirm: ConfirmCheckout) {
  const mdk = getMoneyDevKit()
  const confirmedCheckout = await mdk.checkouts.confirm(confirm)

  const invoice = confirmedCheckout.invoiceScid
    ? mdk.invoices.createWithScid(confirmedCheckout.invoiceScid, confirmedCheckout.invoiceAmountSats)
    : mdk.invoices.create(confirmedCheckout.invoiceAmountSats)

  const pendingPaymentCheckout = await mdk.checkouts.registerInvoice({
    paymentHash: invoice.paymentHash,
    invoice: invoice.invoice,
    invoiceExpiresAt: invoice.expiresAt,
    checkoutId: confirmedCheckout.id,
    nodeId: mdk.getNodeId(),
    scid: invoice.scid,
  })

  return pendingPaymentCheckout
}

export interface CreateCheckoutParams {
  prompt: string
  amount?: number
  currency?: 'USD' | 'SAT'
  metadata?: Record<string, any>
}

export async function createCheckout(params: CreateCheckoutParams) {
  const amount = params.amount ?? 200
  const currency = params.currency ?? 'USD'
  const metadataOverrides = params.metadata ?? {}

  const mdk = getMoneyDevKit()

  const checkout = await mdk.checkouts.create({
    amount,
    currency,
    metadata: { prompt: params.prompt, ...metadataOverrides },
  })

  if (checkout.status === 'CONFIRMED') {
    const invoice = checkout.invoiceScid
      ? mdk.invoices.createWithScid(checkout.invoiceScid, checkout.invoiceAmountSats)
      : mdk.invoices.create(checkout.invoiceAmountSats)

    const pendingPaymentCheckout = await mdk.checkouts.registerInvoice({
      paymentHash: invoice.paymentHash,
      invoice: invoice.invoice,
      invoiceExpiresAt: invoice.expiresAt,
      checkoutId: checkout.id,
      nodeId: mdk.getNodeId(),
      scid: invoice.scid,
    })

    return pendingPaymentCheckout
  }

  return checkout
}

export async function payInvoice(paymentHash: string, amountSats: number) {
  const mdk = getMoneyDevKit()
  const result = await mdk.checkouts.paymentReceived({
    payments: [
      {
        paymentHash,
        amountSats,
      },
    ],
  })

  markPaymentReceived(paymentHash)

  return result
}

export async function paymentHasBeenReceived(paymentHash: string) {
  if (!paymentHash) {
    return false
  }
  log('Checking payment received for', paymentHash)
  return hasPaymentBeenReceived(paymentHash)
}
