import type { Checkout, ConfirmCheckout, Product } from '@moneydevkit/api-contract'

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
 */
function toCamelCase(str: string): string {
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
 */
function normalizeFieldName(field: string): string {
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
 */
function cleanCustomerInput(customer: CustomerInput | undefined): CustomerInput | undefined {
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
 */
function normalizeRequireCustomerData(fields: string[] | undefined): string[] | undefined {
  if (!fields) return undefined
  return fields.map(normalizeFieldName)
}

type Currency = 'USD' | 'SAT'

type CommonCheckoutFields = {
  currency?: Currency
  successUrl?: string
  checkoutPath?: string
  metadata?: Record<string, unknown>
  customer?: CustomerInput
  requireCustomerData?: string[]
}

type AmountCheckoutParams = CommonCheckoutFields & {
  type: 'AMOUNT'
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
  amount?: never
  title?: never
  description?: never
}

export type CreateCheckoutParams = AmountCheckoutParams | ProductCheckoutParams

export async function createCheckout(
  params: CreateCheckoutParams
): Promise<Result<{ checkout: Checkout }>> {
  const currency = params.currency ?? 'USD'
  const metadataOverrides = params.metadata ?? {}

  const isProductCheckout = params.type === 'PRODUCTS'
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
    const message = err instanceof Error ? err.message : String(err)
    logError('Checkout creation failed:', message)
    return failure({
      code: 'checkout_creation_failed',
      message: `Failed to create checkout: ${message}`,
    })
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
