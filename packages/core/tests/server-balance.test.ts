import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalAccessToken = process.env.MDK_ACCESS_TOKEN
const originalBaseUrl = process.env.MDK_API_BASE_URL

const TEST_ACCESS_TOKEN = 'test-secret-token'

const getBalanceCall = mock.fn(async () => ({ balanceSats: 4_242 }))

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
        getBalance: getBalanceCall,
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

const { getBalance } = await import('../src/server')

beforeEach(() => {
  process.env.MDK_ACCESS_TOKEN = TEST_ACCESS_TOKEN
  process.env.MDK_API_BASE_URL = 'http://localhost:3900/rpc'
})

afterEach(() => {
  getBalanceCall.mock.resetCalls()
  if (originalAccessToken === undefined) delete process.env.MDK_ACCESS_TOKEN
  else process.env.MDK_ACCESS_TOKEN = originalAccessToken
  if (originalBaseUrl === undefined) delete process.env.MDK_API_BASE_URL
  else process.env.MDK_API_BASE_URL = originalBaseUrl
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
  } else {
    delete (globalThis as typeof globalThis & { window?: unknown }).window
  }
  getBalanceCall.mock.mockImplementation(async () => ({ balanceSats: 4_242 }))
})

test('getBalance returns server_only when called in a browser-like runtime', async () => {
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'server_only')
  assert.equal(result.error?.retryable, false)
  assert.equal(getBalanceCall.mock.callCount(), 0)
})

test('getBalance requires MDK_ACCESS_TOKEN env', async () => {
  delete process.env.MDK_ACCESS_TOKEN

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'missing_access_token')
  assert.equal(result.error?.retryable, false)
  assert.equal(getBalanceCall.mock.callCount(), 0)
})

test('getBalance returns balanceSats on success', async () => {
  const result = await getBalance()

  assert.deepEqual(result.data, { balanceSats: 4_242 })
  assert.equal(result.error, null)
  assert.equal(getBalanceCall.mock.callCount(), 1)
})

test('getBalance classifies APP_KEY_REQUIRED as non-retryable', async () => {
  getBalanceCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('FORBIDDEN', {
      message: 'App-scoped API key required',
      status: 403,
      data: { code: 'GET_BALANCE_APP_KEY_REQUIRED' },
    })
  })

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'GET_BALANCE_APP_KEY_REQUIRED')
  assert.equal(result.error?.retryable, false)
})

test('getBalance treats SPIN_UP_TIMEOUT (and other ORPC errors) as retryable', async () => {
  getBalanceCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('SERVICE_UNAVAILABLE', {
      message: 'Merchant node did not respond',
      status: 503,
      data: { code: 'GET_BALANCE_SPIN_UP_TIMEOUT' },
    })
  })

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'GET_BALANCE_SPIN_UP_TIMEOUT')
  assert.equal(result.error?.retryable, true)
  assert.equal(result.error?.status, 503)
})

test('getBalance classifies UNAUTHORIZED (invalid API key) as non-retryable', async () => {
  getBalanceCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('UNAUTHORIZED', {
      message: 'API key is required',
      status: 401,
    })
  })

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.retryable, false)
  assert.equal(result.error?.status, 401)
})

test('getBalance classifies FORBIDDEN (banned user) as non-retryable', async () => {
  getBalanceCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('FORBIDDEN', {
      message: 'Account is disabled.',
      status: 403,
      data: { code: 'USER_BANNED' },
    })
  })

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.retryable, false)
  assert.equal(result.error?.status, 403)
})

test('getBalance classifies NOT_FOUND (pre-0.1.30 merchant or older mdk.com) as non-retryable', async () => {
  getBalanceCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('NOT_FOUND', {
      message: 'Procedure checkout.getBalance not found',
      status: 404,
    })
  })

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.retryable, false)
  assert.equal(result.error?.status, 404)
})

test('getBalance classifies BAD_REQUEST as non-retryable', async () => {
  getBalanceCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('BAD_REQUEST', {
      message: 'invalid input',
      status: 400,
    })
  })

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.retryable, false)
  assert.equal(result.error?.status, 400)
})

test('getBalance treats raw network errors as retryable', async () => {
  getBalanceCall.mock.mockImplementation(async () => {
    throw new Error('fetch failed')
  })

  const result = await getBalance()

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'get_balance_failed')
  assert.equal(result.error?.retryable, true)
})
