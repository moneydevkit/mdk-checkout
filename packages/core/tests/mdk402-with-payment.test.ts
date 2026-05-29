import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'crypto'

import { createL402Credential } from '../src/mdk402/token'

// =============================================================================
// Type-level tests (compile-time assertions for the unified WithPaymentConfig)
//
// These don't run; tsc enforces them at typecheck time. The point is to lock
// down the contract: WithPaymentConfig must accept the same shapes that
// createCheckout accepts, plus the L402 extras (Dynamic<T>, expirySeconds).
// If this file stops compiling, the contract has drifted.
// =============================================================================

import type { WithPaymentConfig } from '../src/mdk402/with-payment'
import type { CreateCheckoutParams } from '../src/actions'

/** Helper: assert that A is assignable to B. */
type Assignable<A, B> = A extends B ? true : false

// A plain CreateCheckoutParams (AMOUNT) must be assignable to WithPaymentConfig.
const _amountLiteral: WithPaymentConfig = {
  type: 'AMOUNT',
  amount: 100,
  currency: 'SAT',
  title: 'demo',
  description: 'demo desc',
  metadata: { tier: 'pro' },
}
void _amountLiteral

// AMOUNT without explicit type (the legacy shape) still works.
const _amountLegacy: WithPaymentConfig = { amount: 100, currency: 'SAT' }
void _amountLegacy

// A PRODUCTS literal must be assignable. title/description are AMOUNT-only by
// contract — the product's own name/description drive the payer- and
// dashboard-facing surfaces in PRODUCTS mode.
const _productsLiteral: WithPaymentConfig = {
  type: 'PRODUCTS',
  product: 'prod_123',
}
void _productsLiteral

// Negative assertion: PRODUCTS mode must reject title/description.
// @ts-expect-error - title is not allowed on PRODUCTS-mode WithPaymentConfig
const _productsRejectsTitle: WithPaymentConfig = {
  type: 'PRODUCTS',
  product: 'prod_123',
  title: 'should not compile',
}
void _productsRejectsTitle

// Dynamic resolvers must be accepted on each field.
const _dynamicAmount: WithPaymentConfig = {
  amount: (req: Request) => req.headers.get('x-tier') === 'pro' ? 200 : 100,
  currency: 'SAT',
}
void _dynamicAmount

const _dynamicProduct: WithPaymentConfig = {
  type: 'PRODUCTS',
  product: async (req: Request) => `prod_${req.headers.get('x-sku')}`,
}
void _dynamicProduct

// L402 extras: expirySeconds must be accepted alongside any of the above.
const _withExpiry: WithPaymentConfig = {
  amount: 100,
  currency: 'SAT',
  expirySeconds: 1800,
}
void _withExpiry

// Assignability check (lives at the type level — tsc enforces it).
// CreateCheckoutParams is a strict subset of WithPaymentConfig (no dynamics, no expiry).
type _checkoutFitsWithPayment = Assignable<CreateCheckoutParams, WithPaymentConfig>
const _check: _checkoutFitsWithPayment = true
void _check

// Known preimage/hash pair
const TEST_PREIMAGE = '0000000000000000000000000000000000000000000000000000000000000001'
const TEST_PAYMENT_HASH = createHash('sha256')
  .update(Buffer.from(TEST_PREIMAGE, 'hex'))
  .digest('hex')

const TEST_ACCESS_TOKEN = 'test-secret-token-for-mdk402-testing'
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const FAKE_INVOICE = 'lnbc1000n1test...'
const FAKE_SCID = 'test-scid-123'
const FAKE_CHECKOUT_ID = 'checkout-123'
const FAKE_NODE_ID = 'node-abc-123'
const FAKE_PRODUCT_ID = 'prod_test_abc'
const FAKE_PRICE_ID = 'price_test_xyz'

function futureTimestamp(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds
}

/** Create a mock checkout object as returned by client.checkouts.create */
function makeFakeConfirmedCheckout(amountSats: number, sandbox = false) {
  return {
    id: FAKE_CHECKOUT_ID,
    status: 'CONFIRMED' as const,
    type: 'AMOUNT' as const,
    invoiceAmountSats: amountSats,
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
    providedAmount: amountSats,
    totalAmount: amountSats,
    discountAmount: 0,
    netAmount: amountSats,
    taxAmount: 0,
    btcPrice: 50000,
    invoice: null,
    // sandbox flag from the api-contract Checkout schema; required field set
    // server-side by mdk.com. Default false; pass true to simulate the
    // AppMode.sandbox / metadata.sandbox-driven path.
    sandbox,
  }
}

/** Create a mock pending payment checkout as returned by mintInvoice. */
function makeFakePendingCheckout(amountSats: number, sandbox = false) {
  return {
    ...makeFakeConfirmedCheckout(amountSats, sandbox),
    status: 'PENDING_PAYMENT' as const,
    invoice: {
      invoice: FAKE_INVOICE,
      paymentHash: TEST_PAYMENT_HASH,
      amountSats,
      amountSatsReceived: null,
      expiresAt: new Date(Date.now() + 900_000),
      currency: 'SAT' as const,
      fiatAmount: amountSats,
      btcPrice: 50000,
    },
  }
}

/** Build fake client for mocking. fakeNode is gone - the merchant SDK no
 *  longer spins up a local ldk-node to mint invoices (race fix). mdk.com
 *  mints via the WS control plane and returns the full pending checkout with
 *  the invoice attached.
 *
 *  products.get is mocked so PRODUCTS-mode retry-verification tests can
 *  exercise the active-product/active-price check path. By default it returns
 *  a product with a single price whose id matches FAKE_PRICE_ID. */
function buildMocks(amountSats = 100) {
  const fakeProduct = {
    id: FAKE_PRODUCT_ID,
    name: 'Test product',
    description: null,
    recurringInterval: null,
    prices: [
      { id: FAKE_PRICE_ID, amountType: 'FIXED' as const, priceAmount: amountSats, currency: 'SAT' as const },
    ],
    userMetadata: null,
    organizationId: 'org_test',
    createdAt: new Date(),
    modifiedAt: null,
  }

  const fakeClient = {
    checkouts: {
      create: mock.fn(async () => makeFakeConfirmedCheckout(amountSats)),
      mintInvoice: mock.fn(async (_input: { checkoutId: string; expirySecs?: number }) =>
        makeFakePendingCheckout(amountSats),
      ),
      redeemL402: mock.fn(async () => ({ redeemed: true })),
      checkL402: mock.fn(async () => ({ redeemed: false })),
    },
    products: {
      get: mock.fn(async (_input: { id: string }) => fakeProduct),
    },
  }

  return { fakeClient, fakeProduct }
}

// We need to mock the mdk module to avoid real Lightning/backend calls.
// Only createMoneyDevKitClient + deriveNodeIdFromConfig are used post-migration;
// no local node is constructed.
let currentMocks: ReturnType<typeof buildMocks>

const mdkMock = mock.module('../src/mdk', {
  namedExports: {
    createMoneyDevKitClient: () => currentMocks.fakeClient,
    deriveNodeIdFromConfig: () => FAKE_NODE_ID,
    resolveMoneyDevKitOptions: () => ({
      accessToken: TEST_ACCESS_TOKEN,
      mnemonic: TEST_MNEMONIC,
      baseUrl: 'http://localhost:3000',
    }),
  },
})

// Also mock preview module to control sandbox behavior
let previewMode = false

const previewMock = mock.module('../src/preview', {
  namedExports: {
    is_preview_environment: () => previewMode,
  },
})

// Import AFTER mocking
const { withPayment, withDeferredSettlement } = await import('../src/mdk402/with-payment')

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.MDK_ACCESS_TOKEN = TEST_ACCESS_TOKEN
  process.env.MDK_MNEMONIC = TEST_MNEMONIC
  currentMocks = buildMocks()
  previewMode = false
})

afterEach(() => {
  process.env = { ...originalEnv }
})

/** Helper to create a Request with optional Authorization header */
function makeRequest(url = 'http://localhost/api/premium', authHeader?: string): Request {
  const headers: Record<string, string> = {}
  if (authHeader) {
    headers['authorization'] = authHeader
  }
  return new Request(url, { headers })
}

/** Helper to create a valid L402 Authorization header bound to a resource */
function makeValidAuth(opts?: { expiresAt?: number; resource?: string; amount?: number; currency?: string }): string {
  const macaroon = createL402Credential({
    paymentHash: TEST_PAYMENT_HASH,
    amountSats: 100,
    expiresAt: opts?.expiresAt ?? futureTimestamp(900),
    accessToken: TEST_ACCESS_TOKEN,
    resource: opts?.resource ?? 'GET:/api/premium',
    amount: opts?.amount ?? 100,
    currency: opts?.currency ?? 'SAT',
  })
  return `L402 ${macaroon}:${TEST_PREIMAGE}`
}

/** Helper to create a valid LSAT Authorization header (legacy compat) */
function makeValidLSATAuth(opts?: { resource?: string; amount?: number; currency?: string }): string {
  const macaroon = createL402Credential({
    paymentHash: TEST_PAYMENT_HASH,
    amountSats: 100,
    expiresAt: futureTimestamp(900),
    accessToken: TEST_ACCESS_TOKEN,
    resource: opts?.resource ?? 'GET:/api/premium',
    amount: opts?.amount ?? 100,
    currency: opts?.currency ?? 'SAT',
  })
  return `LSAT ${macaroon}:${TEST_PREIMAGE}`
}

/** Simple inner handler used in all tests */
const innerHandler = async (req: Request) => {
  return Response.json({ success: true, url: req.url })
}

describe('withPayment', () => {
  describe('no authorization header (402 path)', () => {
    it('returns 402 with invoice and macaroon', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)

      const body = await res.json()
      assert.equal(body.error.code, 'payment_required')
      assert.equal(body.error.message, 'Payment required')
      assert.equal(typeof body.macaroon, 'string')
      assert.equal(body.invoice, FAKE_INVOICE)
      assert.equal(body.paymentHash, TEST_PAYMENT_HASH)
      assert.equal(typeof body.amountSats, 'number')
      assert.equal(typeof body.expiresAt, 'number')
    })

    it('includes L402 WWW-Authenticate header', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      const wwwAuth = res.headers.get('www-authenticate')
      assert.ok(wwwAuth)
      assert.ok(wwwAuth.startsWith('L402 '))
      assert.ok(wwwAuth.includes('macaroon="'))
      assert.ok(wwwAuth.includes('invoice="'))
    })

    it('402 credential contains the correct resource binding', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium'))

      assert.equal(res.status, 402)
      const body = await res.json()

      const decoded = JSON.parse(Buffer.from(body.macaroon, 'base64').toString('utf8'))
      assert.equal(decoded.resource, 'GET:/api/premium')
    })

    it('creates checkout on MDK backend', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      await wrapped(makeRequest('http://localhost/api/premium'))

      assert.equal(currentMocks.fakeClient.checkouts.create.mock.callCount(), 1)
      const call = currentMocks.fakeClient.checkouts.create.mock.calls[0]
      assert.equal(call.arguments[0].amount, 100)
      assert.equal(call.arguments[0].currency, 'SAT')
      assert.equal(call.arguments[0].metadata.source, '402')
      assert.equal(call.arguments[1], FAKE_NODE_ID)
    })

    it('mints invoice with custom expiry', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT', expirySeconds: 3600 }, innerHandler)
      await wrapped(makeRequest())

      assert.equal(currentMocks.fakeClient.checkouts.mintInvoice.mock.callCount(), 1)
      const call = currentMocks.fakeClient.checkouts.mintInvoice.mock.calls[0]
      assert.equal(call.arguments[0].expirySecs, 3600)
    })

    it('mints invoice with default 900s expiry', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      await wrapped(makeRequest())

      const call = currentMocks.fakeClient.checkouts.mintInvoice.mock.calls[0]
      assert.equal(call.arguments[0].expirySecs, 900)
    })

    it('mints invoice for the confirmed checkout', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      await wrapped(makeRequest())

      assert.equal(currentMocks.fakeClient.checkouts.mintInvoice.mock.callCount(), 1)
      const call = currentMocks.fakeClient.checkouts.mintInvoice.mock.calls[0]
      assert.equal(call.arguments[0].checkoutId, FAKE_CHECKOUT_ID)
    })
  })

  describe('malformed L402 header (401 path, not 402)', () => {
    it('returns 401 when L402 scheme present but missing colon separator', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', 'L402 macaroononly'))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_credential')
      // Should NOT create a checkout
      assert.equal(currentMocks.fakeClient.checkouts.create.mock.callCount(), 0)
    })

    it('returns 401 when L402 scheme present but empty preimage', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', 'L402 macaroon:'))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_credential')
    })

    it('returns 401 when LSAT scheme present but malformed', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', 'LSAT garbage'))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_credential')
    })

    it('returns 402 (new invoice) for non-L402 scheme like Bearer', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', 'Bearer sometoken'))

      assert.equal(res.status, 402)
    })

    // BACK-COMPAT GAP-FILL: when the credential is malformed AND the URL the
    // client hits doesn't match the credential's resource, the malformed-
    // credential 401 must win over the resource-mismatch 403. Fail-fast on
    // structural issues before doing semantic checks. Locks in the order so
    // the refactor doesn't accidentally swap them.
    it('malformed L402 credential beats resource_mismatch (fail-fast on structural error)', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(
        makeRequest('http://localhost/api/different-endpoint', 'L402 garbage:nopreimage'),
      )

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_credential')
    })
  })

  describe('valid L402 authorization (200 path)', () => {
    it('calls inner handler and returns 200', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.success, true)
    })

    it('passes original request to inner handler', async () => {
      let receivedUrl = ''
      const handler = async (req: Request) => {
        receivedUrl = req.url
        return Response.json({ ok: true })
      }

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, handler)
      await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(receivedUrl, 'http://localhost/api/premium')
    })

    it('does not create checkout or invoice on valid auth', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(currentMocks.fakeClient.checkouts.create.mock.callCount(), 0)
      assert.equal(currentMocks.fakeClient.checkouts.mintInvoice.mock.callCount(), 0)
    })

    it('calls redeemL402 with payment hash', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 1)
      const call = currentMocks.fakeClient.checkouts.redeemL402.mock.calls[0]
      assert.equal(call.arguments[0].paymentHash, TEST_PAYMENT_HASH)
    })
  })

  describe('credential consumption (replay protection)', () => {
    it('returns 401 when credential has already been consumed', async () => {
      currentMocks.fakeClient.checkouts.redeemL402 = mock.fn(async () => ({
        redeemed: false,
        reason: 'already_consumed',
      }))

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'credential_consumed')
    })

    it('returns 401 when invoice is not found', async () => {
      currentMocks.fakeClient.checkouts.redeemL402 = mock.fn(async () => ({
        redeemed: false,
        reason: 'invoice_not_found',
      }))

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'credential_consumed')
    })
  })

  describe('LSAT backwards compatibility (200 path)', () => {
    it('accepts legacy LSAT scheme and returns 200', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', makeValidLSATAuth()))

      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.success, true)
    })
  })

  describe('resource mismatch (403 path)', () => {
    it('returns 403 when credential resource does not match request endpoint', async () => {
      const macaroon = createL402Credential({
        paymentHash: TEST_PAYMENT_HASH,
        amountSats: 100,
        expiresAt: futureTimestamp(900),
        accessToken: TEST_ACCESS_TOKEN,
        resource: 'GET:/api/cheap',
        amount: 100,
        currency: 'SAT',
      })

      const wrapped = withPayment({ amount: 10000, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest(
        'http://localhost/api/expensive',
        `L402 ${macaroon}:${TEST_PREIMAGE}`,
      ))

      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error.code, 'resource_mismatch')
    })

    it('returns 403 when credential method does not match request method', async () => {
      const auth = makeValidAuth({ resource: 'GET:/api/premium' })

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const req = new Request('http://localhost/api/premium', {
        method: 'POST',
        headers: {
          'authorization': auth,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      const res = await wrapped(req)
      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error.code, 'resource_mismatch')
    })
  })

  describe('invalid payment proof (401 path)', () => {
    it('returns 401 for wrong preimage', async () => {
      const wrongPreimage = '0000000000000000000000000000000000000000000000000000000000000002'
      const macaroon = createL402Credential({
        paymentHash: TEST_PAYMENT_HASH,
        amountSats: 100,
        expiresAt: futureTimestamp(900),
        accessToken: TEST_ACCESS_TOKEN,
        resource: 'GET:/api/premium',
        amount: 100,
        currency: 'SAT',
      })

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${wrongPreimage}`))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_payment_proof')
    })

    it('returns 401 for tampered credential', async () => {
      const macaroon = createL402Credential({
        paymentHash: TEST_PAYMENT_HASH,
        amountSats: 100,
        expiresAt: futureTimestamp(900),
        accessToken: TEST_ACCESS_TOKEN,
        resource: 'GET:/api/premium',
        amount: 100,
        currency: 'SAT',
      })

      // Tamper the credential
      const decoded = JSON.parse(Buffer.from(macaroon, 'base64').toString('utf8'))
      decoded.amountSats = 999
      const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', `L402 ${tampered}:${TEST_PREIMAGE}`))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_credential')
    })
  })

  describe('expired credential', () => {
    it('accepts expired credential with valid preimage (paid credentials never expire)', async () => {
      const expiredAuth = makeValidAuth({ expiresAt: Math.floor(Date.now() / 1000) - 60 })

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', expiredAuth))

      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.success, true)
      // Should NOT create a new checkout - the credential is still valid
      assert.equal(currentMocks.fakeClient.checkouts.create.mock.callCount(), 0)
      // Should redeem normally
      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 1)
    })
  })

  describe('dynamic pricing', () => {
    it('calls pricing function with request', async () => {
      let receivedUrl = ''
      const priceFn = (req: Request) => {
        receivedUrl = req.url
        return 250
      }

      const wrapped = withPayment({ amount: priceFn, currency: 'SAT' }, innerHandler)
      await wrapped(makeRequest('http://localhost/api/dynamic'))

      assert.equal(receivedUrl, 'http://localhost/api/dynamic')
      const call = currentMocks.fakeClient.checkouts.create.mock.calls[0]
      assert.equal(call.arguments[0].amount, 250)
    })

    it('supports async pricing function', async () => {
      const asyncPriceFn = async () => {
        return 500
      }

      const wrapped = withPayment({ amount: asyncPriceFn, currency: 'USD' }, innerHandler)
      await wrapped(makeRequest())

      const call = currentMocks.fakeClient.checkouts.create.mock.calls[0]
      assert.equal(call.arguments[0].amount, 500)
      assert.equal(call.arguments[0].currency, 'USD')
    })

    it('returns 500 when pricing function throws', async () => {
      const failingPriceFn = () => {
        throw new Error('Price service unavailable')
      }

      const wrapped = withPayment({ amount: failingPriceFn, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'pricing_error')
    })

    // BACK-COMPAT GAP-FILL: the pricing_error body must surface the thrown
    // Error.message via `details` so merchants can debug their config from logs.
    // Locks this in before the refactor potentially restructures the error shape.
    it('pricing_error response includes the thrown error message in details', async () => {
      const failingPriceFn = () => {
        throw new Error('External rate API is down')
      }

      const wrapped = withPayment({ amount: failingPriceFn, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'pricing_error')
      assert.equal(body.error.details, 'External rate API is down')
    })

    it('returns 403 when credential amount does not match current dynamic price', async () => {
      // Credential was issued for amount=50, but pricing function now returns 250
      const auth = makeValidAuth({ amount: 50, resource: 'GET:/api/dynamic' })

      const priceFn = () => 250
      const wrapped = withPayment({ amount: priceFn, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/dynamic', auth))

      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error.code, 'amount_mismatch')
    })

    it('returns 403 when credential currency does not match config currency', async () => {
      // Credential was issued with SAT, but config now says USD
      const auth = makeValidAuth({ amount: 100, currency: 'SAT' })

      const wrapped = withPayment({ amount: 100, currency: 'USD' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', auth))

      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error.code, 'amount_mismatch')
    })

    it('returns 500 when pricing function throws during verification', async () => {
      // Credential is valid but pricing function fails when re-evaluated
      const failingPriceFn = () => {
        throw new Error('Price service down')
      }

      const auth = makeValidAuth({ amount: 100 })
      const wrapped = withPayment({ amount: failingPriceFn, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', auth))

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'pricing_error')
    })

    it('402 response credential contains correct amount and currency', async () => {
      const wrapped = withPayment({ amount: 250, currency: 'USD' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium'))

      assert.equal(res.status, 402)
      const body = await res.json()

      const decoded = JSON.parse(Buffer.from(body.macaroon, 'base64').toString('utf8'))
      assert.equal(decoded.amount, 250)
      assert.equal(decoded.currency, 'USD')
    })
  })

  describe('configuration errors', () => {
    it('returns 500 when MDK_ACCESS_TOKEN is missing', async () => {
      delete process.env.MDK_ACCESS_TOKEN

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'configuration_error')
    })
  })

  describe('checkout creation failures', () => {
    it('returns 502 when checkout create throws', async () => {
      currentMocks.fakeClient.checkouts.create = mock.fn(async () => {
        throw new Error('Backend unavailable')
      })

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 502)
      const body = await res.json()
      assert.equal(body.error.code, 'checkout_creation_failed')
    })

    it('returns 502 when checkout is not CONFIRMED', async () => {
      currentMocks.fakeClient.checkouts.create = mock.fn(async () => ({
        ...makeFakeConfirmedCheckout(100),
        status: 'UNCONFIRMED',
      }))

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 502)
      const body = await res.json()
      assert.equal(body.error.code, 'checkout_creation_failed')
    })

    // BACK-COMPAT GAP-FILL: mintInvoice succeeding but returning a checkout
    // without an invoice attached is a distinct backend failure mode and gets
    // its own code. Locks in the discriminator before the refactor.
    it('returns 502 invoice_mint_failed when mintInvoice returns checkout without invoice', async () => {
      currentMocks.fakeClient.checkouts.mintInvoice = mock.fn(async () => ({
        ...makeFakePendingCheckout(100),
        invoice: null,
      }))

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 502)
      const body = await res.json()
      assert.equal(body.error.code, 'invoice_mint_failed')
    })
  })

  describe('preview/sandbox mode', () => {
    it('accepts any preimage when in preview mode', async () => {
      previewMode = true

      // Use a completely wrong preimage
      const macaroon = createL402Credential({
        paymentHash: TEST_PAYMENT_HASH,
        amountSats: 100,
        expiresAt: futureTimestamp(900),
        accessToken: TEST_ACCESS_TOKEN,
        resource: 'GET:/api/premium',
        amount: 100,
        currency: 'SAT',
      })
      const wrongPreimage = 'ff'.repeat(32)

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${wrongPreimage}`))

      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.success, true)
    })

    it('still rejects invalid credential HMAC in preview mode', async () => {
      previewMode = true

      const macaroon = createL402Credential({
        paymentHash: TEST_PAYMENT_HASH,
        amountSats: 100,
        expiresAt: futureTimestamp(900),
        accessToken: 'wrong-key',
        resource: 'GET:/api/premium',
        amount: 100,
        currency: 'SAT',
      })

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${TEST_PREIMAGE}`))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_credential')
    })

    it('includes sandbox metadata in 402 checkout creation', async () => {
      previewMode = true

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      await wrapped(makeRequest())

      const call = currentMocks.fakeClient.checkouts.create.mock.calls[0]
      assert.equal(call.arguments[0].metadata.sandbox, 'true')
    })

    it('includes sandbox: true in 402 JSON body when in preview mode', async () => {
      previewMode = true

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(body.sandbox, true)
    })

    it('includes sandbox="true" parameter in WWW-Authenticate header when in preview mode', async () => {
      previewMode = true

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      const wwwAuth = res.headers.get('www-authenticate')
      assert.ok(wwwAuth, 'WWW-Authenticate header must be present')
      assert.ok(wwwAuth.includes('sandbox="true"'), `expected sandbox="true" in header, got: ${wwwAuth}`)
      assert.ok(wwwAuth.startsWith('L402 '))
      assert.ok(wwwAuth.includes('macaroon="'))
      assert.ok(wwwAuth.includes('invoice="'))
    })

    it('omits sandbox signals in 402 response when NOT in preview mode (regression guard)', async () => {
      previewMode = false

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(body.sandbox, undefined, 'sandbox field must not be present in production responses')

      const wwwAuth = res.headers.get('www-authenticate')
      assert.ok(wwwAuth)
      assert.ok(!wwwAuth.includes('sandbox'), `WWW-Authenticate must not contain sandbox in production, got: ${wwwAuth}`)
    })
  })

  // Path B coverage: merchant runtime is NOT a preview env, but the server-side
  // checkout was minted in sandbox mode (driven by AppMode.sandbox on mdk.com
  // even when metadata.sandbox isn't set by the SDK). Without this fix the
  // sandbox signals would all be dropped, leaving the client with an unpayable
  // placeholder invoice and no way to satisfy the 402.
  describe('sandbox via server-side Checkout.sandbox column (AppMode.sandbox path)', () => {
    beforeEach(() => {
      previewMode = false
      currentMocks.fakeClient.checkouts.mintInvoice = mock.fn(async () =>
        makeFakePendingCheckout(100, true),
      )
    })

    it('emits sandbox="true" in WWW-Authenticate when checkout.sandbox=true (prod runtime)', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const wwwAuth = res.headers.get('www-authenticate')
      assert.ok(wwwAuth, 'WWW-Authenticate header must be present')
      assert.ok(
        wwwAuth.includes('sandbox="true"'),
        `expected sandbox="true" in header, got: ${wwwAuth}`,
      )
    })

    it('emits sandbox: true in JSON body when checkout.sandbox=true (prod runtime)', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(body.sandbox, true)
    })

    it('verify path accepts any preimage when credential carries sandbox=true (prod runtime)', async () => {
      // Reproduce the exact failure path: prod runtime + sandbox-mode checkout.
      // A naive client would have no real preimage; the fix is that the
      // signed sandbox flag on the credential allows the server to skip
      // preimage verification just like in a preview environment.
      const macaroon = createL402Credential({
        paymentHash: TEST_PAYMENT_HASH,
        amountSats: 100,
        expiresAt: futureTimestamp(900),
        accessToken: TEST_ACCESS_TOKEN,
        resource: 'GET:/api/premium',
        amount: 100,
        currency: 'SAT',
        sandbox: true,
      })
      const fakePreimage = 'ff'.repeat(32)

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(
        makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${fakePreimage}`),
      )

      assert.equal(res.status, 200, 'sandbox credential should bypass preimage check')
      const body = await res.json()
      assert.equal(body.success, true)
    })

    it('verify path STILL rejects bogus preimage when credential is sandbox=false (regression guard)', async () => {
      // Mirror of the above with sandbox=false to lock in that the preimage
      // skip is gated on the credential field, not unconditional.
      const macaroon = createL402Credential({
        paymentHash: TEST_PAYMENT_HASH,
        amountSats: 100,
        expiresAt: futureTimestamp(900),
        accessToken: TEST_ACCESS_TOKEN,
        resource: 'GET:/api/premium',
        amount: 100,
        currency: 'SAT',
        sandbox: false,
      })
      const fakePreimage = 'ff'.repeat(32)

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(
        makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${fakePreimage}`),
      )

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_payment_proof')
    })
  })

  describe('HTTP methods', () => {
    it('works with POST requests', async () => {
      const postHandler = async (req: Request) => {
        const body = await req.json()
        return Response.json({ received: body })
      }

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, postHandler)
      const req = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'authorization': makeValidAuth({ resource: 'POST:/api/test' }),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ data: 'test' }),
      })

      const res = await wrapped(req)
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.deepEqual(body.received, { data: 'test' })
    })
  })

  describe('route context pass-through', () => {
    it('passes context to inner handler for dynamic routes', async () => {
      let receivedContext: any = null
      const handler = async (req: Request, context?: any) => {
        receivedContext = context
        return Response.json({ id: (await context.params).id })
      }

      const fakeContext = { params: Promise.resolve({ id: '42' }) }

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(
        makeRequest('http://localhost/api/premium', makeValidAuth()),
        fakeContext,
      )

      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.id, '42')
      assert.strictEqual(receivedContext, fakeContext)
    })

    it('passes undefined context when none is provided', async () => {
      let receivedContext: any = 'sentinel'
      const handler = async (req: Request, context?: any) => {
        receivedContext = context
        return Response.json({ ok: true })
      }

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, handler)
      await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(receivedContext, undefined)
    })

    it('does not pass context when returning 402', async () => {
      let handlerCalled = false
      const handler = async (req: Request, context?: any) => {
        handlerCalled = true
        return Response.json({})
      }

      const fakeContext = { params: Promise.resolve({ id: '42' }) }

      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest(), fakeContext)

      assert.equal(res.status, 402)
      assert.equal(handlerCalled, false)
    })
  })

  describe('response format', () => {
    it('402 response body matches L402 spec', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.headers.get('content-type'), 'application/json')

      const body = await res.json()
      // Check all required fields
      assert.ok(body.error, 'should have error object')
      assert.equal(body.error.code, 'payment_required')
      assert.equal(body.error.message, 'Payment required')
      assert.equal(typeof body.macaroon, 'string')
      assert.equal(typeof body.invoice, 'string')
      assert.equal(typeof body.paymentHash, 'string')
      assert.equal(typeof body.amountSats, 'number')
      assert.equal(typeof body.expiresAt, 'number')
    })

    // BACK-COMPAT GAP-FILL: sandbox-mode responses must keep
    // `content-type: application/json` like production. Locks in the header
    // so the refactor doesn't drop it from the sandbox branch.
    it('content-type is application/json in sandbox mode too', async () => {
      previewMode = true
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.headers.get('content-type'), 'application/json')
    })
  })

  describe('title/description/metadata config (AMOUNT mode)', () => {
    it('passes static title through to checkouts.create metadata', async () => {
      const wrapped = withPayment(
        { amount: 100, currency: 'SAT', title: 'Premium endpoint' },
        innerHandler,
      )
      await wrapped(makeRequest())

      const call = currentMocks.fakeClient.checkouts.create.mock.calls[0]
      assert.equal(call.arguments[0].metadata.title, 'Premium endpoint')
    })

    it('resolves dynamic title callback with the request', async () => {
      let receivedUrl = ''
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          title: (req) => {
            receivedUrl = req.url
            return `API for ${new URL(req.url).pathname}`
          },
        },
        innerHandler,
      )
      await wrapped(makeRequest('http://localhost/api/v1/foo'))

      assert.equal(receivedUrl, 'http://localhost/api/v1/foo')
      const call = currentMocks.fakeClient.checkouts.create.mock.calls[0]
      assert.equal(call.arguments[0].metadata.title, 'API for /api/v1/foo')
    })

    it('passes static description through to checkouts.create metadata', async () => {
      const wrapped = withPayment(
        { amount: 100, currency: 'SAT', description: 'Daily wine pairing' },
        innerHandler,
      )
      await wrapped(makeRequest())

      const call = currentMocks.fakeClient.checkouts.create.mock.calls[0]
      assert.equal(call.arguments[0].metadata.description, 'Daily wine pairing')
    })

    it('merges static merchant metadata, system keys take precedence', async () => {
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          metadata: { tier: 'pro', source: 'overridden-by-merchant', resource: 'hijack-attempt' },
        },
        innerHandler,
      )
      await wrapped(makeRequest('http://localhost/api/premium'))

      const md = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0].metadata
      // Merchant key preserved
      assert.equal(md.tier, 'pro')
      // System keys cannot be overridden
      assert.equal(md.source, '402')
      assert.equal(md.resource, 'http://localhost/api/premium')
    })

    it('top-level title/description override matching merchant metadata keys', async () => {
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          title: 'Top-level title',
          metadata: { title: 'Metadata title (should lose)' },
        },
        innerHandler,
      )
      await wrapped(makeRequest())

      const md = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0].metadata
      assert.equal(md.title, 'Top-level title')
    })

    it('resolves dynamic metadata callback with the request', async () => {
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          metadata: (req) => ({ requestId: new URL(req.url).searchParams.get('id') ?? 'none' }),
        },
        innerHandler,
      )
      await wrapped(makeRequest('http://localhost/api/premium?id=req-42'))

      const md = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0].metadata
      assert.equal(md.requestId, 'req-42')
    })

    it('forwards customer and requireCustomerData to checkouts.create', async () => {
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          customer: { name: 'Agent X', email: 'agent@example.com', externalId: 'ext-1' },
          requireCustomerData: ['name', 'email'],
        },
        innerHandler,
      )
      await wrapped(makeRequest())

      const arg = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0]
      assert.deepEqual(arg.customer, { name: 'Agent X', email: 'agent@example.com', externalId: 'ext-1' })
      assert.deepEqual(arg.requireCustomerData, ['name', 'email'])
    })

    it('returns 500 config_error when title callback throws', async () => {
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          title: () => {
            throw new Error('boom')
          },
        },
        innerHandler,
      )
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'config_error')
    })

    // EXTENSION GAP-FILL: async title/description/metadata callbacks (parity
    // with the existing async amount callback test on line 525). resolveDynamic
    // awaits Promise returns, so this should already work — locks it in before
    // the refactor changes the resolution path.
    it('awaits an async title callback', async () => {
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          title: async (req) => `async-title-for-${new URL(req.url).pathname}`,
        },
        innerHandler,
      )
      await wrapped(makeRequest('http://localhost/api/x'))

      const md = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0].metadata
      assert.equal(md.title, 'async-title-for-/api/x')
    })

    it('awaits an async description callback', async () => {
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          description: async () => 'async-description',
        },
        innerHandler,
      )
      await wrapped(makeRequest())

      const md = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0].metadata
      assert.equal(md.description, 'async-description')
    })

    it('awaits an async metadata callback', async () => {
      const wrapped = withPayment(
        {
          amount: 100,
          currency: 'SAT',
          metadata: async () => ({ flavor: 'async' }),
        },
        innerHandler,
      )
      await wrapped(makeRequest())

      const md = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0].metadata
      assert.equal(md.flavor, 'async')
    })

    // EXTENSION GAP-FILL: explicit `type: 'AMOUNT'` must behave identically to
    // omitting type (the default). Locks in the discriminator default-value
    // semantics before the refactor that may reshape the config dispatch.
    it('accepts explicit type: "AMOUNT" identically to omitting type', async () => {
      const wrapped = withPayment({ type: 'AMOUNT', amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(typeof body.macaroon, 'string')
      // Should hit the AMOUNT checkouts.create branch (no `product` field).
      const arg = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0]
      assert.equal(arg.amount, 100)
      assert.equal(arg.currency, 'SAT')
      assert.equal(arg.product, undefined)
    })

  })

  describe('PRODUCTS-mode 402 issuance', () => {
    // Mint returns a checkout that looks like an MDK-resolved product checkout:
    // productId/productPriceId set, providedAmount populated from the price.
    function setProductsMintMock() {
      currentMocks.fakeClient.checkouts.mintInvoice = mock.fn(async () => ({
        ...makeFakePendingCheckout(100),
        productId: FAKE_PRODUCT_ID,
        productPriceId: FAKE_PRICE_ID,
        providedAmount: 100,
        currency: 'SAT',
      }))
      currentMocks.fakeClient.checkouts.create = mock.fn(async () => ({
        ...makeFakeConfirmedCheckout(100),
        productId: FAKE_PRODUCT_ID,
        productPriceId: FAKE_PRICE_ID,
      }))
    }

    it('passes product (not amount/currency) to checkouts.create', async () => {
      setProductsMintMock()
      const wrapped = withPayment({ type: 'PRODUCTS', product: FAKE_PRODUCT_ID }, innerHandler)
      await wrapped(makeRequest())

      const arg = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0]
      assert.equal(arg.product, FAKE_PRODUCT_ID)
      assert.equal(arg.amount, undefined)
      assert.equal(arg.currency, undefined)
    })

    it('resolves dynamic product callback with the request', async () => {
      setProductsMintMock()
      const wrapped = withPayment(
        {
          type: 'PRODUCTS',
          product: (req) => `prod_${new URL(req.url).pathname.slice(1)}`,
        },
        innerHandler,
      )
      await wrapped(makeRequest('http://localhost/premium'))

      const arg = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0]
      assert.equal(arg.product, 'prod_premium')
    })

    it('returns 500 pricing_error when product callback throws', async () => {
      const wrapped = withPayment(
        {
          type: 'PRODUCTS',
          product: () => {
            throw new Error('product lookup failed')
          },
        },
        innerHandler,
      )
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'pricing_error')
    })

    // EXTENSION GAP-FILL: expirySeconds must work in PRODUCTS mode (locks in
    // that the option isn't AMOUNT-specific).
    it('passes custom expirySeconds to mintInvoice in PRODUCTS mode', async () => {
      setProductsMintMock()
      const wrapped = withPayment(
        { type: 'PRODUCTS', product: FAKE_PRODUCT_ID, expirySeconds: 1800 },
        innerHandler,
      )
      await wrapped(makeRequest())

      assert.equal(currentMocks.fakeClient.checkouts.mintInvoice.mock.callCount(), 1)
      const call = currentMocks.fakeClient.checkouts.mintInvoice.mock.calls[0]
      assert.equal(call.arguments[0].expirySecs, 1800)
    })

    // EXTENSION GAP-FILL: system-reserved metadata keys (source, resource,
    // sandbox) must override merchant metadata in PRODUCTS mode too. Only
    // tested for AMOUNT today (line 841).
    it('system-reserved metadata keys override merchant metadata in PRODUCTS mode', async () => {
      setProductsMintMock()
      const wrapped = withPayment(
        {
          type: 'PRODUCTS',
          product: FAKE_PRODUCT_ID,
          metadata: { source: 'overridden', resource: 'hijack', tier: 'pro' },
        },
        innerHandler,
      )
      await wrapped(makeRequest('http://localhost/api/products-endpoint'))

      const md = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0].metadata
      assert.equal(md.tier, 'pro')
      assert.equal(md.source, '402')
      assert.equal(md.resource, 'http://localhost/api/products-endpoint')
    })

    // EXTENSION GAP-FILL: PRODUCTS-mode 402 body must have the same shape as
    // AMOUNT-mode (no extra/missing top-level fields). The product binding
    // lives INSIDE the macaroon, not at the body's top level.
    it('PRODUCTS-mode 402 body has identical top-level shape to AMOUNT mode', async () => {
      setProductsMintMock()
      const wrapped = withPayment({ type: 'PRODUCTS', product: FAKE_PRODUCT_ID }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.ok(body.error)
      assert.equal(typeof body.macaroon, 'string')
      assert.equal(typeof body.invoice, 'string')
      assert.equal(typeof body.paymentHash, 'string')
      assert.equal(typeof body.amountSats, 'number')
      assert.equal(typeof body.expiresAt, 'number')
      // No leaked product/price fields at the body level.
      assert.equal(body.productId, undefined)
      assert.equal(body.priceId, undefined)
    })

    // EXTENSION GAP-FILL: amountSats in the 402 body reflects what mdk.com
    // resolved from the product price (advisory but exposed to callers so
    // they can display "X sats due"). Locks in the wire field.
    it('PRODUCTS-mode 402 amountSats comes from the pending checkout invoiceAmountSats', async () => {
      setProductsMintMock()
      const wrapped = withPayment({ type: 'PRODUCTS', product: FAKE_PRODUCT_ID }, innerHandler)
      const res = await wrapped(makeRequest())

      const body = await res.json()
      assert.equal(body.amountSats, 100) // matches makeFakePendingCheckout(100)
    })
  })

  describe('PRODUCTS-mode credential retry verification', () => {
    /**
     * Create a v1 PRODUCTS-mode credential. The v1 token contract carries no
     * productId/priceId — verification matches by amount+currency instead.
     * amount defaults to 100 SAT to match the fakeProduct price in buildMocks.
     */
    function makeProductsCredential(opts?: { amount?: number; currency?: string; resource?: string }) {
      return createL402Credential({
        paymentHash: TEST_PAYMENT_HASH,
        amountSats: 100,
        expiresAt: futureTimestamp(900),
        accessToken: TEST_ACCESS_TOKEN,
        resource: opts?.resource ?? 'GET:/api/premium',
        amount: opts?.amount ?? 100,
        currency: opts?.currency ?? 'SAT',
      })
    }

    it('returns 200 when product has a matching price snapshot (amount + currency)', async () => {
      // buildMocks fakeProduct has prices[0] = { priceAmount: 100, currency: 'SAT' }
      // credential has amount=100, currency='SAT' → match → 200.
      const macaroon = makeProductsCredential()
      const wrapped = withPayment(
        { type: 'PRODUCTS', product: FAKE_PRODUCT_ID },
        innerHandler,
      )
      const res = await wrapped(
        makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${TEST_PREIMAGE}`),
      )

      assert.equal(res.status, 200)
      // products.get must have been called for the verification check
      assert.equal(currentMocks.fakeClient.products.get.mock.callCount(), 1)
      assert.equal(currentMocks.fakeClient.products.get.mock.calls[0].arguments[0].id, FAKE_PRODUCT_ID)
    })

    // EXTENSION GAP-FILL: products.get must NOT be called on AMOUNT-mode
    // retries. Negative assertion guards against a future regression where
    // every retry needlessly hits the product API.
    it('does NOT call products.get during AMOUNT-mode credential retry', async () => {
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(
        makeRequest('http://localhost/api/premium', makeValidAuth()),
      )

      assert.equal(res.status, 200)
      assert.equal(currentMocks.fakeClient.products.get.mock.callCount(), 0)
    })

    it('returns 500 pricing_error when product fetch throws (product archived)', async () => {
      currentMocks.fakeClient.products.get = mock.fn(async () => {
        throw new Error('product not found')
      })
      const macaroon = makeProductsCredential()
      const wrapped = withPayment(
        { type: 'PRODUCTS', product: FAKE_PRODUCT_ID },
        innerHandler,
      )
      const res = await wrapped(
        makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${TEST_PREIMAGE}`),
      )

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'pricing_error')
      assert.equal(body.error.recoverable, undefined)
    })

    it('returns 403 amount_mismatch when no price snapshot matches the credential (price retired)', async () => {
      // Credential was issued for amount=999 (no price in the product has this amount)
      const macaroon = makeProductsCredential({ amount: 999 })
      const wrapped = withPayment(
        { type: 'PRODUCTS', product: FAKE_PRODUCT_ID },
        innerHandler,
      )
      const res = await wrapped(
        makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${TEST_PREIMAGE}`),
      )

      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error.code, 'amount_mismatch')
      assert.equal(body.error.recoverable, true)
    })

  })

  describe('sandbox body + WWW-Authenticate signals', () => {
    it('includes "sandbox": true in 402 JSON body when in preview mode', async () => {
      previewMode = true
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(body.sandbox, true)
    })

    it('includes sandbox="true" parameter in WWW-Authenticate header when in preview mode', async () => {
      previewMode = true
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      const wwwAuth = res.headers.get('www-authenticate')
      assert.ok(wwwAuth)
      assert.ok(wwwAuth.includes('sandbox="true"'), `expected sandbox="true" in header, got: ${wwwAuth}`)
      assert.ok(wwwAuth.startsWith('L402 '))
      assert.ok(wwwAuth.includes('macaroon="'))
      assert.ok(wwwAuth.includes('invoice="'))
    })

    it('omits sandbox signals in 402 response when NOT in preview mode (regression guard)', async () => {
      previewMode = false
      const wrapped = withPayment({ amount: 100, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(body.sandbox, undefined)

      const wwwAuth = res.headers.get('www-authenticate')
      assert.ok(wwwAuth)
      assert.ok(!wwwAuth.includes('sandbox'), `WWW-Authenticate must not contain sandbox in production, got: ${wwwAuth}`)
    })

    // EXTENSION GAP-FILL: all three sandbox signals (body, header, checkout
    // metadata) must fire in PRODUCTS mode just like AMOUNT mode. Locks in
    // sandbox-mode parity across both config shapes.
    it('emits all sandbox signals in PRODUCTS mode (body + header + checkout metadata)', async () => {
      previewMode = true
      // Match the PRODUCTS-mode mint mock pattern from the issuance describe block.
      currentMocks.fakeClient.checkouts.create = mock.fn(async () => ({
        ...makeFakeConfirmedCheckout(100),
        productId: FAKE_PRODUCT_ID,
        productPriceId: FAKE_PRICE_ID,
      }))
      currentMocks.fakeClient.checkouts.mintInvoice = mock.fn(async () => ({
        ...makeFakePendingCheckout(100),
        productId: FAKE_PRODUCT_ID,
        productPriceId: FAKE_PRICE_ID,
        providedAmount: 100,
        currency: 'SAT',
      }))

      const wrapped = withPayment({ type: 'PRODUCTS', product: FAKE_PRODUCT_ID }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(body.sandbox, true)

      const wwwAuth = res.headers.get('www-authenticate')
      assert.ok(wwwAuth)
      assert.ok(wwwAuth.includes('sandbox="true"'))

      // The metadata.sandbox='true' string flag is what mdk.com reads to force
      // the BOLT11 sentinel description — must be set in PRODUCTS mode too.
      const md = currentMocks.fakeClient.checkouts.create.mock.calls[0].arguments[0].metadata
      assert.equal(md.sandbox, 'true')
    })
  })

  // ---------------------------------------------------------------------------
  // Contract extensions (still valid after v2 revert):
  //   - `recoverable: boolean` on error responses for codes that imply
  //     "discard credential and retry" (amount_mismatch) vs permanent failure.
  //   - `config_invalid` for the static-validation paths (replaces the
  //     overloaded `pricing_error` for non-callback validation).
  //   - `pricing_error` carries top-level `phase: 'create' | 'verify'` to
  //     disambiguate where the failure occurred.
  // Note: `mode_mismatch`, `product_not_active`, and `price_not_active` were
  // v2-only error codes and have been removed. `amount_mismatch` (recoverable)
  // covers all "credential can't pay for what this endpoint costs" scenarios.
  // ---------------------------------------------------------------------------
  describe('refactor extensions to the contract', () => {
    it('amount_mismatch (price changed) carries recoverable: true', async () => {
      // Existing back-compat code; new `recoverable` field is the extension.
      const auth = makeValidAuth({ amount: 50, resource: 'GET:/api/dynamic' })
      const priceFn = () => 250
      const wrapped = withPayment({ amount: priceFn, currency: 'SAT' }, innerHandler)
      const res = await wrapped(makeRequest('http://localhost/api/dynamic', auth))

      const body = await res.json()
      assert.equal(body.error.code, 'amount_mismatch')
      assert.equal(body.error.recoverable, true)
    })

    it('static amount: non-number → 500 config_invalid (not pricing_error)', async () => {
      const wrapped = withPayment(
        { amount: 'not-a-number' as unknown as number, currency: 'SAT' },
        innerHandler,
      )
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'config_invalid')
    })

    it('static product: empty string → 500 config_invalid (not pricing_error)', async () => {
      const wrapped = withPayment({ type: 'PRODUCTS', product: '' }, innerHandler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'config_invalid')
    })

    it('pricing_error carries a top-level phase to distinguish create-time vs verify-time failure', async () => {
      // Verify-time failure: pricing callback that succeeds at 402 issuance
      // (returning 100) but throws when re-evaluated during retry. `phase` is
      // a new top-level optional field on the error envelope; `details` stays
      // a string for back-compat with the existing pricing_error contract.
      let callCount = 0
      const priceFn = () => {
        callCount++
        if (callCount === 1) return 100
        throw new Error('rate service down on retry')
      }

      const wrapped = withPayment({ amount: priceFn, currency: 'SAT' }, innerHandler)
      const res402 = await wrapped(makeRequest())
      assert.equal(res402.status, 402)
      const body402 = await res402.json()
      const macaroon = body402.macaroon

      const resVerify = await wrapped(
        makeRequest('http://localhost/api/premium', `L402 ${macaroon}:${TEST_PREIMAGE}`),
      )
      assert.equal(resVerify.status, 500)
      const bodyVerify = await resVerify.json()
      assert.equal(bodyVerify.error.code, 'pricing_error')
      assert.equal(bodyVerify.error.phase, 'verify')
    })
  })
})

describe('withDeferredSettlement', () => {
  describe('no authorization header (402 path)', () => {
    it('returns 402 with invoice just like withPayment', async () => {
      const handler = async (req: Request, settle: () => Promise<any>) => {
        return Response.json({ success: true })
      }
      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(body.error.code, 'payment_required')
    })
  })

  describe('settle() called - service delivered successfully', () => {
    it('calls handler with settle callback and returns 200', async () => {
      const handler = async (req: Request, settle: () => Promise<any>) => {
        const result = await settle()
        assert.deepEqual(result, { settled: true })
        return Response.json({ success: true })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.success, true)
    })

    it('redeems the credential when settle() is called', async () => {
      const handler = async (req: Request, settle: () => Promise<any>) => {
        await settle()
        return Response.json({ ok: true })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 1)
      const call = currentMocks.fakeClient.checkouts.redeemL402.mock.calls[0]
      assert.equal(call.arguments[0].paymentHash, TEST_PAYMENT_HASH)
    })
  })

  describe('settle() NOT called - service delivery failed', () => {
    it('does not redeem the credential', async () => {
      const handler = async (req: Request, settle: () => Promise<any>) => {
        // Simulate service failure - don't call settle()
        return Response.json({ error: 'service_unavailable' }, { status: 503 })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(res.status, 503)
      // redeemL402 should never have been called
      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 0)
    })

    it('allows payer to retry with the same credential', async () => {
      let attempt = 0
      const handler = async (req: Request, settle: () => Promise<any>) => {
        attempt++
        if (attempt === 1) {
          // First attempt: service fails, don't settle
          return Response.json({ error: 'service_unavailable' }, { status: 503 })
        }
        // Second attempt: service succeeds, settle
        await settle()
        return Response.json({ success: true })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const auth = makeValidAuth()

      // First attempt - fails, no settle
      const res1 = await wrapped(makeRequest('http://localhost/api/premium', auth))
      assert.equal(res1.status, 503)
      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 0)

      // Second attempt - succeeds, settles
      const res2 = await wrapped(makeRequest('http://localhost/api/premium', auth))
      assert.equal(res2.status, 200)
      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 1)
    })
  })

  describe('settle() called twice - idempotency', () => {
    it('returns error on second call without hitting backend', async () => {
      let secondResult: any
      const handler = async (req: Request, settle: () => Promise<any>) => {
        await settle()
        secondResult = await settle()
        return Response.json({ ok: true })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.deepEqual(secondResult, { settled: false, error: 'already_settled' })
      // Backend called only once
      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 1)
    })
  })

  describe('settle() when backend rejects', () => {
    it('returns error from backend reason', async () => {
      currentMocks.fakeClient.checkouts.redeemL402 = mock.fn(async () => ({
        redeemed: false,
        reason: 'already_consumed',
      }))

      let settleResult: any
      const handler = async (req: Request, settle: () => Promise<any>) => {
        settleResult = await settle()
        return Response.json({ ok: false }, { status: 500 })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.deepEqual(settleResult, { settled: false, error: 'already_consumed' })
    })
  })

  describe('already-consumed credential (replay protection)', () => {
    it('returns 401 when credential has already been settled', async () => {
      currentMocks.fakeClient.checkouts.checkL402 = mock.fn(async () => ({ redeemed: true }))

      let handlerCalled = false
      const handler = async (req: Request, settle: () => Promise<any>) => {
        handlerCalled = true
        return Response.json({ success: true })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'credential_consumed')
      // Handler should NOT have been called
      assert.equal(handlerCalled, false)
      // redeemL402 should NOT have been called
      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 0)
    })

    it('runs handler when credential has not been consumed', async () => {
      currentMocks.fakeClient.checkouts.checkL402 = mock.fn(async () => ({ redeemed: false }))

      const handler = async (req: Request, settle: () => Promise<any>) => {
        await settle()
        return Response.json({ success: true })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', makeValidAuth()))

      assert.equal(res.status, 200)
      assert.equal(currentMocks.fakeClient.checkouts.checkL402.mock.callCount(), 1)
      assert.equal(currentMocks.fakeClient.checkouts.redeemL402.mock.callCount(), 1)
    })
  })

  describe('credential verification (shared with withPayment)', () => {
    it('returns 401 for invalid credential', async () => {
      const handler = async (req: Request, settle: () => Promise<any>) => {
        return Response.json({ success: true })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', 'L402 garbage:garbage'))

      assert.equal(res.status, 401)
      const body = await res.json()
      assert.equal(body.error.code, 'invalid_credential')
    })

    it('returns 403 for resource mismatch', async () => {
      const handler = async (req: Request, settle: () => Promise<any>) => {
        return Response.json({ success: true })
      }

      const auth = makeValidAuth({ resource: 'GET:/api/other' })
      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', auth))

      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error.code, 'resource_mismatch')
    })

    it('returns 403 for amount mismatch', async () => {
      const handler = async (req: Request, settle: () => Promise<any>) => {
        return Response.json({ success: true })
      }

      const auth = makeValidAuth({ amount: 50 })
      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest('http://localhost/api/premium', auth))

      assert.equal(res.status, 403)
      const body = await res.json()
      assert.equal(body.error.code, 'amount_mismatch')
    })

    it('returns 500 when MDK_ACCESS_TOKEN is missing', async () => {
      delete process.env.MDK_ACCESS_TOKEN

      const handler = async (req: Request, settle: () => Promise<any>) => {
        return Response.json({ success: true })
      }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(makeRequest())

      assert.equal(res.status, 500)
      const body = await res.json()
      assert.equal(body.error.code, 'configuration_error')
    })
  })

  describe('context pass-through', () => {
    it('passes context as third argument after settle', async () => {
      let receivedContext: any = null
      const handler = async (req: Request, settle: () => Promise<any>, context?: any) => {
        receivedContext = context
        await settle()
        return Response.json({ id: (await context.params).id })
      }

      const fakeContext = { params: Promise.resolve({ id: '42' }) }

      const wrapped = withDeferredSettlement({ amount: 100, currency: 'SAT' }, handler)
      const res = await wrapped(
        makeRequest('http://localhost/api/premium', makeValidAuth()),
        fakeContext,
      )

      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.id, '42')
      assert.strictEqual(receivedContext, fakeContext)
    })
  })
})
