'use server'

import type { ConfirmCheckout } from '@moneydevkit/api-contract'
import { log } from './logging'
import { createMoneyDevKitClient, createMoneyDevKitNode } from './mdk'
import { hasPaymentBeenReceived, markPaymentReceived } from './payment-state'

export async function getCheckout(checkoutId: string) {
  const client = createMoneyDevKitClient()
  return await client.checkouts.get({ id: checkoutId })
}

export async function confirmCheckout(confirm: ConfirmCheckout) {
  const client = createMoneyDevKitClient()
  const node = createMoneyDevKitNode()
  const confirmedCheckout = await client.checkouts.confirm(confirm)

  const invoice = confirmedCheckout.invoiceScid
    ? node.invoices.createWithScid(confirmedCheckout.invoiceScid, confirmedCheckout.invoiceAmountSats)
    : node.invoices.create(confirmedCheckout.invoiceAmountSats)

  const pendingPaymentCheckout = await client.checkouts.registerInvoice({
    paymentHash: invoice.paymentHash,
    invoice: invoice.invoice,
    invoiceExpiresAt: invoice.expiresAt,
    checkoutId: confirmedCheckout.id,
    nodeId: node.id,
    scid: invoice.scid,
  })

  return pendingPaymentCheckout
}

export interface CreateCheckoutParams {
  title: string,
  description: string,
  amount: number
  currency?: 'USD' | 'SAT'
  successUrl?: string,
  checkoutPath?: string,
  metadata?: Record<string, any>
}

export async function createCheckout(params: CreateCheckoutParams) {
  const amount = params.amount ?? 200
  const currency = params.currency ?? 'USD'
  const metadataOverrides = params.metadata ?? {}

  const client = createMoneyDevKitClient()
  const node = createMoneyDevKitNode()

  const checkout = await client.checkouts.create(
    {
      amount,
      currency,
      metadata: {
        title: params.title,
        description: params.description,
        successUrl: params.successUrl,
        ...metadataOverrides,
      },
    }, node.id)

  if (checkout.status === 'CONFIRMED') {
    const invoice = checkout.invoiceScid
      ? node.invoices.createWithScid(checkout.invoiceScid, checkout.invoiceAmountSats)
      : node.invoices.create(checkout.invoiceAmountSats)

    const pendingPaymentCheckout = await client.checkouts.registerInvoice({
      paymentHash: invoice.paymentHash,
      invoice: invoice.invoice,
      invoiceExpiresAt: invoice.expiresAt,
      checkoutId: checkout.id,
      nodeId: node.id,
      scid: invoice.scid,
    })

    return pendingPaymentCheckout
  }

  return checkout
}

export async function payInvoice(paymentHash: string, amountSats: number) {
  const client = createMoneyDevKitClient()
  const result = await client.checkouts.paymentReceived({
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
