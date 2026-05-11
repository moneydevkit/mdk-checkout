import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, mock, test } from 'node:test'

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalAccessToken = process.env.MDK_ACCESS_TOKEN
const originalBaseUrl = process.env.MDK_API_BASE_URL

const TEST_ACCESS_TOKEN = 'test-secret-token'

const programmaticPayoutCall = mock.fn(async (_input: unknown) => ({
  accepted: true as const,
  paymentId: 'pid-server-1',
  paymentHash: null,
}))

class FakeORPCError extends Error {
  readonly code: string
  readonly status: number
  readonly data: unknown
  constructor(code: string, opts: { message: string; status?: number; data?: unknown }) {
    super(opts.message)
    this.code = code
    this.status = opts.status ?? 500
    this.data = opts.data
  }
}

mock.module('@orpc/client', {
  namedExports: {
    ORPCError: FakeORPCError,
    createORPCClient: mock.fn(() => ({
      checkout: {
        programmaticPayout: programmaticPayoutCall,
      },
    })),
  },
})

mock.module('@orpc/client/fetch', {
  namedExports: {
    RPCLink: mock.fn(function RPCLink(this: unknown) {
      return this
    }),
  },
})

const { programmaticPayout } = await import('../src/server')

beforeEach(() => {
  process.env.MDK_ACCESS_TOKEN = TEST_ACCESS_TOKEN
  process.env.MDK_API_BASE_URL = 'http://localhost:3900/rpc'
})

afterEach(() => {
  programmaticPayoutCall.mock.resetCalls()
  if (originalAccessToken === undefined) delete process.env.MDK_ACCESS_TOKEN
  else process.env.MDK_ACCESS_TOKEN = originalAccessToken
  if (originalBaseUrl === undefined) delete process.env.MDK_API_BASE_URL
  else process.env.MDK_API_BASE_URL = originalBaseUrl
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
  } else {
    delete (globalThis as typeof globalThis & { window?: unknown }).window
  }
  programmaticPayoutCall.mock.mockImplementation(async () => ({
    accepted: true as const,
    paymentId: 'pid-server-1',
    paymentHash: null,
  }))
})

test('programmaticPayout returns server_only when called in a browser-like runtime', async () => {
  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true,
  })

  const result = await programmaticPayout({
    amountSats: 1000,
    destination: 'lnbc1server',
    idempotencyKey: 'order-1',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'server_only')
  assert.equal(result.error?.retryable, false)
  assert.match(result.error?.message ?? '', /server function/)
  assert.equal(programmaticPayoutCall.mock.callCount(), 0)
})

test('programmaticPayout rejects invalid server-side amounts before dispatching', async () => {
  const result = await programmaticPayout({
    amountSats: 1.5,
    destination: 'lnbc1server',
    idempotencyKey: 'order-1',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'invalid_amount')
  assert.equal(result.error?.retryable, false)
  assert.equal(programmaticPayoutCall.mock.callCount(), 0)
})

test('programmaticPayout rejects invalid destinations before dispatching', async () => {
  const result = await programmaticPayout({
    amountSats: 1000,
    destination: 'lnbc1bad\ninvoice',
    idempotencyKey: 'order-1',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'invalid_destination')
  assert.equal(result.error?.retryable, false)
  assert.equal(programmaticPayoutCall.mock.callCount(), 0)
})

test('programmaticPayout rejects empty idempotencyKey', async () => {
  const result = await programmaticPayout({
    amountSats: 1000,
    destination: 'lnbc1server',
    idempotencyKey: '',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'invalid_idempotency_key')
  assert.equal(result.error?.retryable, false)
  assert.equal(programmaticPayoutCall.mock.callCount(), 0)
})

test('programmaticPayout requires MDK_ACCESS_TOKEN env', async () => {
  delete process.env.MDK_ACCESS_TOKEN
  const result = await programmaticPayout({
    amountSats: 1000,
    destination: 'lnbc1server',
    idempotencyKey: 'order-1',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'missing_access_token')
  assert.equal(result.error?.retryable, false)
  assert.equal(programmaticPayoutCall.mock.callCount(), 0)
})

test('programmaticPayout can dispatch from a server runtime', async () => {
  const result = await programmaticPayout({
    amountSats: 1000,
    destination: '  lnbc1server  ',
    idempotencyKey: 'idem-server',
  })

  assert.deepEqual(result.data, {
    accepted: true,
    paymentId: 'pid-server-1',
    paymentHash: null,
  })
  assert.equal(result.error, null)
  assert.equal(programmaticPayoutCall.mock.callCount(), 1)
  assert.deepEqual(programmaticPayoutCall.mock.calls[0]?.arguments[0], {
    amountSats: 1000,
    destination: 'lnbc1server',
    idempotencyKey: 'idem-server',
  })
})

test('programmaticPayout classifies daily limit as retryable', async () => {
  programmaticPayoutCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('BAD_REQUEST', {
      message: 'Programmatic payouts are limited to 5000000 sats per 24 hours.',
      status: 400,
      data: { code: 'PROGRAMMATIC_PAYOUT_DAILY_LIMIT_EXCEEDED' },
    })
  })

  const result = await programmaticPayout({
    amountSats: 1000,
    destination: 'lnbc1server',
    idempotencyKey: 'order-1',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'PROGRAMMATIC_PAYOUT_DAILY_LIMIT_EXCEEDED')
  assert.equal(result.error?.retryable, true)
  assert.equal(result.error?.reason, 'daily_limit_exceeded')
})

test('programmaticPayout classifies disabled-app as non-retryable', async () => {
  programmaticPayoutCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('FORBIDDEN', {
      message: 'Programmatic payouts are disabled for this app.',
      status: 403,
      data: { code: 'PROGRAMMATIC_PAYOUTS_DISABLED' },
    })
  })

  const result = await programmaticPayout({
    amountSats: 1000,
    destination: 'lnbc1server',
    idempotencyKey: 'order-1',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'PROGRAMMATIC_PAYOUTS_DISABLED')
  assert.equal(result.error?.retryable, false)
  assert.equal(result.error?.reason, 'programmatic_payouts_disabled')
})

test('programmaticPayout marks unknown ORPC errors as unclassified', async () => {
  programmaticPayoutCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('INTERNAL_SERVER_ERROR', {
      message: 'something broke',
      status: 500,
      data: { code: 'NEW_BACKEND_CODE' },
    })
  })

  const result = await programmaticPayout({
    amountSats: 1000,
    destination: 'lnbc1server',
    idempotencyKey: 'order-1',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'NEW_BACKEND_CODE')
  assert.equal(result.error?.retryable, undefined)
  assert.equal(result.error?.reason, undefined)
})

test('programmaticPayout marks raw network errors as retryable', async () => {
  programmaticPayoutCall.mock.mockImplementation(async () => {
    throw new Error('fetch failed')
  })

  const result = await programmaticPayout({
    amountSats: 1000,
    destination: 'lnbc1server',
    idempotencyKey: 'order-1',
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'payout_failed')
  assert.equal(result.error?.retryable, true)
})

test('client exports do not expose payout helpers', () => {
  const clientEntry = readFileSync(new URL('../src/client.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(clientEntry, /programmaticPayout/)
  assert.doesNotMatch(clientEntry, /payout/)
})

test('server module does not import lightning-js stack', () => {
  const serverEntry = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(serverEntry, /from ['"]\.\/mdk['"]/)
  assert.doesNotMatch(serverEntry, /from ['"]\.\/lightning-node['"]/)
  assert.doesNotMatch(serverEntry, /@moneydevkit\/lightning-js/)
})
