import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import type { ConfirmCheckout } from '@moneydevkit/api-contract'
import type { CreateCheckoutParams } from './actions'

const API_PATH = '/api/mdk'

async function postToMdk<T>(handler: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handler, ...payload }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`MDK request failed (${response.status}): ${errorBody}`)
  }

  return (await response.json()) as T
}

export async function clientCreateCheckout(params: CreateCheckoutParams) {
  const response = await postToMdk<{ data: CheckoutType }>('create_checkout', { params })
  if (!response?.data) {
    throw new Error('Invalid create checkout response')
  }
  return response.data
}

export async function clientGetCheckout(checkoutId: string) {
  const response = await postToMdk<{ data: CheckoutType }>('get_checkout', { checkoutId })
  if (!response?.data) {
    throw new Error('Checkout not found')
  }
  return response.data
}

export async function clientConfirmCheckout(confirm: ConfirmCheckout) {
  const response = await postToMdk<{ data: CheckoutType }>('confirm_checkout', { confirm })
  if (!response?.data) {
    throw new Error('Failed to confirm checkout')
  }
  return response.data
}
