'use server'

import type { ConfirmCheckout } from '@moneydevkit/api-contract'
import { DEFAULT_LSP_NODE_ID } from '../constants'
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
  lspNodeId?: string
}

export async function createCheckout(params: CreateCheckoutParams | string) {
  // Support legacy string parameter for backward compatibility
  const normalized: CreateCheckoutParams = typeof params === 'string'
    ? { prompt: params }
    : params

  const amount = normalized.amount ?? 200
  const currency = normalized.currency ?? 'USD'
  const metadataOverrides = normalized.metadata ?? {}
  const lspNodeId = normalized.lspNodeId ?? DEFAULT_LSP_NODE_ID

  const mdk = getMoneyDevKit({
    nodeOptions: {
      lspNodeId,
    },
  })

  const checkout = await mdk.checkouts.create({
    amount,
    currency,
    metadata: { prompt: normalized.prompt, ...metadataOverrides },
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
  console.log('Checking payment received for', paymentHash)
  return hasPaymentBeenReceived(paymentHash)
}
