import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

const originalEnv = { ...process.env }
const FAKE_NODE_ID = 'node-sandbox-test'

function fakeCheckout(status: 'CONFIRMED' | 'PENDING_PAYMENT' = 'CONFIRMED') {
  return {
    id: 'checkout-sandbox-test',
    status,
    type: 'AMOUNT' as const,
    invoiceAmountSats: 100,
    invoiceScid: null,
    currency: 'SAT' as const,
    createdAt: new Date(),
    clientSecret: 'cs_test',
    organizationId: 'org_test',
    expiresAt: new Date(Date.now() + 900_000),
    userMetadata: null,
    customFieldData: null,
    allowDiscountCodes: false,
    requireCustomerData: null,
    successUrl: null,
    customer: null,
    customerBillingAddress: null,
    products: null,
    productId: null,
    productPriceId: null,
    customAmount: null,
    product: null,
    providedAmount: 100,
    totalAmount: 100,
    discountAmount: 0,
    netAmount: 100,
    taxAmount: 0,
    btcPrice: 50000,
    invoice: null,
    sandbox: false,
  }
}

let previewMode = false
let createPayloads: unknown[] = []

const fakeClient = {
  checkouts: {
    create: mock.fn(async (payload: unknown) => {
      createPayloads.push(payload)
      return fakeCheckout('CONFIRMED')
    }),
    mintInvoice: mock.fn(async () => fakeCheckout('PENDING_PAYMENT')),
  },
}

mock.module('../src/mdk', {
  namedExports: {
    createMoneyDevKitClient: () => fakeClient,
    deriveNodeIdFromConfig: () => FAKE_NODE_ID,
  },
})

mock.module('../src/preview', {
  namedExports: {
    is_preview_environment: () => previewMode,
  },
})

const { createCheckout } = await import('../src/actions')

beforeEach(() => {
  createPayloads = []
  previewMode = false
  process.env = { ...originalEnv }
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('createCheckout sandbox forwarding', () => {
  it('forwards sandbox=true when MDK_PREVIEW=true', async () => {
    previewMode = true

    const result = await createCheckout({
      type: 'AMOUNT',
      amount: 100,
      currency: 'SAT',
    })

    assert.equal(result.error, null)
    assert.deepEqual(createPayloads[0], {
      amount: 100,
      currency: 'SAT',
      product: undefined,
      successUrl: undefined,
      metadata: {
        title: undefined,
        description: undefined,
      },
      customer: undefined,
      requireCustomerData: undefined,
      sandbox: true,
    })
  })

  it('lets explicit sandbox=true win outside preview', async () => {
    const result = await createCheckout({
      type: 'AMOUNT',
      amount: 100,
      currency: 'SAT',
      sandbox: true,
    })

    assert.equal(result.error, null)
    assert.deepEqual(createPayloads[0], {
      amount: 100,
      currency: 'SAT',
      product: undefined,
      successUrl: undefined,
      metadata: {
        title: undefined,
        description: undefined,
      },
      customer: undefined,
      requireCustomerData: undefined,
      sandbox: true,
    })
  })

  it('omits sandbox when not preview and not explicit', async () => {
    const result = await createCheckout({
      type: 'AMOUNT',
      amount: 100,
      currency: 'SAT',
    })

    assert.equal(result.error, null)
    assert.equal('sandbox' in (createPayloads[0] as Record<string, unknown>), false)
  })
})
