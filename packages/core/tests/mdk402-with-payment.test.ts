import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'crypto'

import { createL402Credential } from '../src/mdk402/token'

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

function futureTimestamp(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds
}

/** Create a mock checkout object as returned by client.checkouts.create */
function makeFakeConfirmedCheckout(amountSats: number) {
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
  }
}

/** Create a mock pending payment checkout as returned by registerInvoice */
function makeFakePendingCheckout(amountSats: number) {
  return {
    ...makeFakeConfirmedCheckout(amountSats),
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
 *  the invoice attached. */
function buildMocks(amountSats = 100) {
  const fakeClient = {
    checkouts: {
      create: mock.fn(async () => makeFakeConfirmedCheckout(amountSats)),
      mintInvoice: mock.fn(async (_input: { checkoutId: string; expirySecs?: number }) =>
        makeFakePendingCheckout(amountSats),
      ),
      redeemL402: mock.fn(async () => ({ redeemed: true })),
      checkL402: mock.fn(async () => ({ redeemed: false })),
    },
  }

  return { fakeClient }
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
