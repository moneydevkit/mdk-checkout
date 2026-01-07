import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import type { ConfirmCheckout } from '@moneydevkit/api-contract'
import type { CreateCheckoutParams } from './actions'
import { is_preview_environment } from './preview'
import type { CheckoutError, ClientCreateCheckoutResult } from './types'

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

type MdkResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: CheckoutError }

async function postToMdk<T>(handler: string, payload: Record<string, unknown>): Promise<MdkResponse<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const csrfToken = ensureCsrfToken()
  if (csrfToken) {
    headers['x-moneydevkit-csrf-token'] = csrfToken
  }

  let response: Response
  try {
    response = await fetch(API_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify({ handler, ...payload }),
    })
  } catch {
    return {
      ok: false,
      error: {
        code: 'network_error',
        message: 'Failed to connect to the server. Please check your internet connection.',
      },
    }
  }

  if (!response.ok) {
    let errorBody: { error?: string; details?: Array<{ message?: string }> } = {}
    try {
      errorBody = await response.json()
    } catch {
      // Response wasn't JSON
    }

    const details = errorBody.details
    const hasValidationDetails = Array.isArray(details) && details.length > 0

    // Extract the first validation error message if available
    const validationMessage = hasValidationDetails ? details[0]?.message : undefined

    return {
      ok: false,
      error: {
        code: hasValidationDetails ? 'validation_error' : response.status >= 500 ? 'server_error' : 'invalid_request',
        message: validationMessage || errorBody.error || `Request failed with status ${response.status}`,
        details: errorBody.details,
      },
    }
  }

  return { ok: true, data: (await response.json()) as T }
}

export async function clientCreateCheckout(params: CreateCheckoutParams): Promise<ClientCreateCheckoutResult> {
  const response = await postToMdk<{ data: CheckoutType }>('create_checkout', { params })

  if (!response.ok) {
    return { data: null, error: response.error }
  }

  if (!response.data?.data) {
    return {
      data: null,
      error: {
        code: 'invalid_response',
        message: 'Invalid response from server',
      },
    }
  }

  return { data: response.data.data, error: null }
}

export async function clientGetCheckout(checkoutId: string): Promise<CheckoutType> {
  const response = await postToMdk<{ data: CheckoutType }>('get_checkout', { checkoutId })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  if (!response.data?.data) {
    throw new Error('Checkout not found')
  }
  return response.data.data
}

export async function clientConfirmCheckout(confirm: ConfirmCheckout): Promise<CheckoutType> {
  const response = await postToMdk<{ data: CheckoutType }>('confirm_checkout', { confirm })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  if (!response.data?.data) {
    throw new Error('Failed to confirm checkout')
  }
  return response.data.data
}

export async function clientPayInvoice(paymentHash: string, amountSats: number) {
  if (!is_preview_environment()) {
    throw new Error('clientPayInvoice is only available in preview environments.')
  }

  const response = await postToMdk('pay_invoice', { paymentHash, amountSats })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
}
