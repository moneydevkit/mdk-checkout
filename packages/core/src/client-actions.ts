import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import type { ConfirmCheckout } from '@moneydevkit/api-contract'
import type { CreateCheckoutParams } from './actions'
import { is_preview_environment } from './preview'

const API_PATH =
  (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_MDK_API_PATH ?? process.env.MDK_API_PATH)) || '/api/mdk'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split('=')
    if (key === name) {
      return rest.join('=')
    }
  }
  return null
}

function ensureCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  let token = getCookie('mdk_csrf')
  if (!token) {
    token = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`
  }

  // In embedded preview environments (e.g., Replit) the app is often running in a third-party context.
  // Use SameSite=None; Secure when possible so the cookie is still sent; fall back to Lax for local/http.
  const cookieAttributes = ['path=/']
  const secureContext = typeof window !== 'undefined' && window.isSecureContext
  if (secureContext) {
    cookieAttributes.push('SameSite=None', 'Secure')
  } else {
    cookieAttributes.push('SameSite=Lax')
  }
  document.cookie = `mdk_csrf=${token}; ${cookieAttributes.join('; ')}`

  return token
}

async function postToMdk<T>(handler: string, payload: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const csrfToken = ensureCsrfToken()
  if (csrfToken) {
    headers['x-moneydevkit-csrf-token'] = csrfToken
  }

  const response = await fetch(API_PATH, {
    method: 'POST',
    headers,
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

export async function clientPayInvoice(paymentHash: string, amountSats: number) {
  if (!is_preview_environment()) {
    throw new Error('clientPayInvoice is only available in preview environments.')
  }

  await postToMdk('pay_invoice', { paymentHash, amountSats })
}
