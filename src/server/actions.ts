'use server'

import type { ConfirmCheckout } from '@moneydevkit/api-contract'
import { getMoneyDevKit } from './mdk'

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

export async function createCheckout(prompt: string) {
  const mdk = getMoneyDevKit()
  const checkout = await mdk.checkouts.create({
    amount: 200,
    currency: 'USD',
    metadata: { prompt },
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

  return result
}
