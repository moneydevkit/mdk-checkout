import type { Checkout as CheckoutType } from '@moneydevkit/api-contract'
import type { ConfirmCheckout } from '@moneydevkit/api-contract'
import type { CreateCheckoutParams } from './actions'
import { is_preview_environment } from './preview'
import type { Result } from './types'

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

/**
 * POST to the MDK API and unwrap the response.
 * Server returns { data: T }, this function unwraps it to Result<T>.
 */
async function postToMdk<T>(handler: string, payload: Record<string, unknown>): Promise<Result<T>> {
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
      data: null,
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
      data: null,
      error: {
        code: hasValidationDetails ? 'validation_error' : response.status >= 500 ? 'server_error' : 'invalid_request',
        message: validationMessage || errorBody.error || `Request failed with status ${response.status}`,
        details: errorBody.details,
      },
    }
  }

  // Server returns { data: T }, unwrap it
  const body = (await response.json()) as { data?: T }

  if (!body.data) {
    return {
      data: null,
      error: {
        code: 'invalid_response',
        message: 'Invalid response from server',
      },
    }
  }

  return { data: body.data, error: null }
}

export async function clientCreateCheckout(params: CreateCheckoutParams): Promise<Result<CheckoutType>> {
  return postToMdk<CheckoutType>('create_checkout', { params })
}

export async function clientGetCheckout(checkoutId: string): Promise<CheckoutType> {
  const result = await postToMdk<CheckoutType>('get_checkout', { checkoutId })
  if (result.error) {
    throw new Error(result.error.message)
  }
  return result.data
}

export async function clientConfirmCheckout(confirm: ConfirmCheckout): Promise<CheckoutType> {
  const result = await postToMdk<CheckoutType>('confirm_checkout', { confirm })
  if (result.error) {
    throw new Error(result.error.message)
  }
  return result.data
}

export async function clientPayInvoice(paymentHash: string, amountSats: number) {
  if (!is_preview_environment()) {
    throw new Error('clientPayInvoice is only available in preview environments.')
  }

  const result = await postToMdk<{ ok: boolean }>('pay_invoice', { paymentHash, amountSats })
  if (result.error) {
    throw new Error(result.error.message)
  }
}
