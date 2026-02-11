import type { Checkout, ConfirmCheckout, Product, CustomerWithSubscriptions, GetCustomerInput } from '@moneydevkit/api-contract'
import { validateMetadata } from '@moneydevkit/api-contract'

import { log, error as logError } from './logging'
import { createMoneyDevKitClient, createMoneyDevKitNode } from './mdk'
import { hasPaymentBeenReceived, markPaymentReceived } from './payment-state'
import { is_preview_environment } from './preview'
import { failure, success } from './types'
import type { Result } from './types'

/**
 * Convert any string format to camelCase.
 * Supports: snake_case, kebab-case, space separated, PascalCase, camelCase
 * @example toCamelCase('custom_field') => 'customField'
 * @example toCamelCase('custom-field') => 'customField'
 * @example toCamelCase('custom field') => 'customField'
 * @example toCamelCase('Custom Field') => 'customField'
 * @internal Exported for testing
 */
export function toCamelCase(str: string): string {
  return str
    // Split on underscores, hyphens, or spaces
    .split(/[-_\s]+/)
    // Also split on camelCase/PascalCase boundaries
    .flatMap(word => word.split(/(?<=[a-z])(?=[A-Z])/))
    // Filter empty strings
    .filter(Boolean)
    // Convert to camelCase
    .map((word, index) => {
      const lower = word.toLowerCase()
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
}

/**
 * Normalize field names to camelCase.
 * Standard fields (email, name) are kept as-is.
 * @internal Exported for testing
 */
export function normalizeFieldName(field: string): string {
  const standardFields = ['email', 'name', 'externalId']
  const camel = toCamelCase(field)
  // Keep standard fields exactly as expected
  if (standardFields.includes(camel)) {
    return camel
  }
  return camel
}

export async function getCheckout(checkoutId: string): Promise<Checkout> {
  // createMoneyDevKitClient can throw on invalid config
  const client = createMoneyDevKitClient()
  return await client.checkouts.get({ id: checkoutId })
}

export async function listProducts(): Promise<Product[]> {
  const client = createMoneyDevKitClient()
  const result = await client.products.list()
  return result.products
}

export async function confirmCheckout(confirm: ConfirmCheckout): Promise<Checkout> {
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

/**
 * Valid fields that can be required at checkout time.
 * 'email' and 'name' are standard fields, anything else is a custom string field.
 */
export type CustomerField = string

/**
 * Customer data for checkout - flat structure with standard and custom fields.
 */
export type CustomerInput = {
  name?: string
  email?: string
  externalId?: string
} & Record<string, string>

/**
 * Strip empty strings from customer object and normalize keys to camelCase.
 * @internal Exported for testing
 */
export function cleanCustomerInput(customer: CustomerInput | undefined): CustomerInput | undefined {
  if (!customer) return undefined
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(customer)) {
    if (typeof value === 'string' && value.trim() !== '') {
      // Normalize key to camelCase
      cleaned[normalizeFieldName(key)] = value
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

/**
 * Normalize requireCustomerData field names to camelCase.
 * @internal Exported for testing
 */
export function normalizeRequireCustomerData(fields: string[] | undefined): string[] | undefined {
  if (!fields) return undefined
  return fields.map(normalizeFieldName)
}

type OrpcIssue = { message?: string; path?: Array<string | number> }

/**
 * Normalize ORPC-ish errors into a consistent shape for UI consumption.
 *
 * Motivation:
 * - The client can receive several error shapes (ORPC, validation errors, plain Error, or network failures).
 * - Without normalization we would either surface a vague "Something went wrong"
 *   or risk breaking the UI by assuming a specific error shape.
 * - This keeps the UI stable and allows consistent rendering of {code, message, status, details}.
 *
 * What it captures:
 * - ORPC errors with { status, data: { code, issues }, message }
 * - Generic errors with { code } or { message }
 * - Falls back to a safe, human‑readable message for unknown shapes.
 */
function normalizeCreateCheckoutError(err: unknown): {
  code: string
  message: string
  status?: number
  details?: OrpcIssue[]
} {
  const fallbackMessage = err instanceof Error ? err.message : String(err)

  let code = 'checkout_creation_failed'
  let message = `Failed to create checkout: ${fallbackMessage}`
  let status: number | undefined
  let details: OrpcIssue[] | undefined
  let hasOrpcShape = false

  if (err && typeof err === 'object') {
    const maybe = err as {
      status?: unknown
      message?: unknown
      data?: unknown
      code?: unknown
    }

    if (typeof maybe.status === 'number') {
      status = maybe.status
      hasOrpcShape = true
    }

    if (maybe.data && typeof maybe.data === 'object') {
      const data = maybe.data as { code?: unknown; issues?: unknown }
      if (typeof data.code === 'string') {
        code = data.code
        hasOrpcShape = true
      }
      if (Array.isArray(data.issues)) {
        details = data.issues as OrpcIssue[]
        hasOrpcShape = true
      }
    }

    if (code === 'checkout_creation_failed' && typeof maybe.code === 'string') {
      code = maybe.code
      hasOrpcShape = true
    }

    if (hasOrpcShape && typeof maybe.message === 'string') {
      message = maybe.message
    }
  }

  return { code, message, status, details }
}

type Currency = 'USD' | 'SAT'

type CommonCheckoutFields = {
  successUrl?: string
  checkoutPath?: string
  metadata?: Record<string, unknown>
  customer?: CustomerInput
  requireCustomerData?: string[]
}

type AmountCheckoutParams = CommonCheckoutFields & {
  type: 'AMOUNT'
  /** Currency for the checkout amount. */
  currency: Currency
  amount: number
  title?: string
  description?: string
  product?: never
}

type ProductCheckoutParams = CommonCheckoutFields & {
  type: 'PRODUCTS'
  /**
   * Product ID to checkout.
   * @example 'prod_123abc'
   */
  product: string
  currency?: never
  amount?: never
  title?: never
  description?: never
}

export type CreateCheckoutParams = AmountCheckoutParams | ProductCheckoutParams

export async function createCheckout(
  params: CreateCheckoutParams
): Promise<Result<{ checkout: Checkout }>> {
  const metadataValidation = validateMetadata(params.metadata as Record<string, string> | undefined)
  if (!metadataValidation.ok) {
    const errorMessages = metadataValidation.error.map((e) => e.message).join('; ')
    return failure({
      code: 'validation_error',
      message: `Invalid metadata: ${errorMessages}`,
    })
  }

  // For PRODUCTS checkouts without explicit currency, let the server infer from product price.
  // For AMOUNT checkouts, currency is required by the type system.
  const isProductCheckout = params.type === 'PRODUCTS'
  const currency = params.currency
  const metadataOverrides = params.metadata ?? {}

  const product = isProductCheckout ? params.product : undefined
  const amount = isProductCheckout ? undefined : params.amount
  const title = isProductCheckout ? undefined : params.title
  const description = isProductCheckout ? undefined : params.description

  try {
    const client = createMoneyDevKitClient()
    const node = createMoneyDevKitNode()
    const checkout = await client.checkouts.create(
      {
        amount,
        currency,
        product,
        successUrl: params.successUrl,
        metadata: {
          title,
          description,
          ...metadataOverrides,
        },
        customer: cleanCustomerInput(params.customer),
        requireCustomerData: normalizeRequireCustomerData(params.requireCustomerData),
      },
      node.id,
    )

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

      return success({ checkout: pendingPaymentCheckout })
    }

    return success({ checkout })
  } catch (err) {
    const normalized = normalizeCreateCheckoutError(err)
    logError('Checkout creation failed:', normalized.message)
    return failure(normalized)
  }
}

export async function markInvoicePaidPreview(paymentHash: string, amountSats: number) {
  if (!is_preview_environment()) {
    throw new Error('markInvoicePaidPreview can only be used in preview environments.')
  }

  const client = createMoneyDevKitClient()
  const paymentsPayload = {
    payments: [
      {
        paymentHash,
        amountSats,
        sandbox: true,
      },
    ],
  }
  const result = await client.checkouts.paymentReceived(paymentsPayload)

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

export interface GetCustomerOptions {
  /** Include sandbox subscriptions in the response. Defaults to false. */
  includeSandbox?: boolean
}

export async function getCustomer(
  params: GetCustomerInput,
  options?: GetCustomerOptions
): Promise<CustomerWithSubscriptions> {
  const client = createMoneyDevKitClient()
  return await client.customers.get({
    ...params,
    includeSandbox: options?.includeSandbox,
  } as GetCustomerInput)
}
