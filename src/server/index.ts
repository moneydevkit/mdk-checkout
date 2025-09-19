'use server'

import {
  getCheckout as getCheckoutImpl,
  confirmCheckout as confirmCheckoutImpl,
  createCheckout as createCheckoutImpl,
  payInvoice as payInvoiceImpl,
} from './actions'

export async function getCheckout(...args: Parameters<typeof getCheckoutImpl>) {
  return getCheckoutImpl(...args)
}

export async function confirmCheckout(...args: Parameters<typeof confirmCheckoutImpl>) {
  return confirmCheckoutImpl(...args)
}

export async function createCheckout(...args: Parameters<typeof createCheckoutImpl>) {
  return createCheckoutImpl(...args)
}

export async function payInvoice(...args: Parameters<typeof payInvoiceImpl>) {
  return payInvoiceImpl(...args)
}
