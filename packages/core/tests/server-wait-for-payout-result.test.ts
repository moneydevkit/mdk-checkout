import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalAccessToken = process.env.MDK_ACCESS_TOKEN
const originalBaseUrl = process.env.MDK_API_BASE_URL

const TEST_ACCESS_TOKEN = 'test-secret-token'

const waitForPayoutResultCall = mock.fn(async (_input: unknown) => ({
  status: 'SUCCESS' as const,
  preimage: 'preimg-1',
  paymentHash: 'ph-1',
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
        waitForPayoutResult: waitForPayoutResultCall,
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

const { waitForPayoutResult } = await import('../src/server')

beforeEach(() => {
  process.env.MDK_ACCESS_TOKEN = TEST_ACCESS_TOKEN
  process.env.MDK_API_BASE_URL = 'http://localhost:3900/rpc'
})

afterEach(() => {
  waitForPayoutResultCall.mock.resetCalls()
  if (originalAccessToken === undefined) delete process.env.MDK_ACCESS_TOKEN
  else process.env.MDK_ACCESS_TOKEN = originalAccessToken
  if (originalBaseUrl === undefined) delete process.env.MDK_API_BASE_URL
  else process.env.MDK_API_BASE_URL = originalBaseUrl
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
  } else {
    delete (globalThis as typeof globalThis & { window?: unknown }).window
  }
  waitForPayoutResultCall.mock.mockImplementation(async () => ({
    status: 'SUCCESS' as const,
    preimage: 'preimg-1',
    paymentHash: 'ph-1',
  }))
})

test('waitForPayoutResult returns server_only in a browser-like runtime', async () => {
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })

  const result = await waitForPayoutResult({ idempotencyKey: 'k', timeoutMs: 1000 })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'server_only')
  assert.equal(waitForPayoutResultCall.mock.callCount(), 0)
})

test('waitForPayoutResult requires exactly one of idempotencyKey or paymentId', async () => {
  const neither = await waitForPayoutResult({ timeoutMs: 1000 })
  assert.equal(neither.error?.code, 'invalid_arguments')
  assert.equal(waitForPayoutResultCall.mock.callCount(), 0)

  const both = await waitForPayoutResult({
    idempotencyKey: 'k',
    paymentId: 'p',
    timeoutMs: 1000,
  })
  assert.equal(both.error?.code, 'invalid_arguments')
  assert.equal(waitForPayoutResultCall.mock.callCount(), 0)
})

test('waitForPayoutResult requires MDK_ACCESS_TOKEN env', async () => {
  delete process.env.MDK_ACCESS_TOKEN
  const result = await waitForPayoutResult({ idempotencyKey: 'k', timeoutMs: 1000 })
  assert.equal(result.error?.code, 'missing_access_token')
  assert.equal(waitForPayoutResultCall.mock.callCount(), 0)
})

test('waitForPayoutResult returns terminal SUCCESS on the first RPC call', async () => {
  const result = await waitForPayoutResult({
    idempotencyKey: 'idem-ok',
    timeoutMs: 1000,
  })

  assert.equal(result.error, null)
  assert.deepEqual(result.data, {
    status: 'SUCCESS',
    preimage: 'preimg-1',
    paymentHash: 'ph-1',
  })
  assert.equal(waitForPayoutResultCall.mock.callCount(), 1)
  // The SDK must forward whatever identifier the caller passed without
  // swapping them.
  assert.deepEqual(waitForPayoutResultCall.mock.calls[0]?.arguments[0], {
    idempotencyKey: 'idem-ok',
    paymentId: undefined,
    timeoutMs: 1000,
  })
})

test('waitForPayoutResult returns FAILED with reason intact', async () => {
  waitForPayoutResultCall.mock.mockImplementation(async () => ({
    status: 'FAILED' as const,
    failureReason: 'RouteNotFound',
  }))

  const result = await waitForPayoutResult({
    idempotencyKey: 'idem-fail',
    timeoutMs: 1000,
  })

  assert.equal(result.error, null)
  assert.deepEqual(result.data, {
    status: 'FAILED',
    failureReason: 'RouteNotFound',
  })
})

test('waitForPayoutResult loops the RPC when timeoutMs exceeds the per-call cap of 25s', async () => {
  // Three back-to-back REQUESTED responses, then SUCCESS. With a 60s total
  // budget the SDK should split into multiple RPC calls each <=25s.
  let n = 0
  waitForPayoutResultCall.mock.mockImplementation(async (input) => {
    const slice = (input as { timeoutMs?: number }).timeoutMs ?? 0
    assert.ok(slice <= 25_000, `slice ${slice} exceeded 25s cap`)
    n += 1
    if (n < 3) return { status: 'REQUESTED' as const }
    return { status: 'SUCCESS' as const, preimage: 'late-preimg' }
  })

  const result = await waitForPayoutResult({
    idempotencyKey: 'idem-loop',
    timeoutMs: 60_000,
  })

  assert.equal(result.error, null)
  assert.equal(result.data?.status, 'SUCCESS')
  assert.equal(result.data?.preimage, 'late-preimg')
  assert.ok(waitForPayoutResultCall.mock.callCount() >= 2)
})

test('waitForPayoutResult returns REQUESTED after exhausting the total budget without a terminal outcome', async () => {
  waitForPayoutResultCall.mock.mockImplementation(async () => ({
    status: 'REQUESTED' as const,
  }))

  const result = await waitForPayoutResult({
    idempotencyKey: 'idem-stuck',
    timeoutMs: 30,
  })

  assert.equal(result.error, null)
  assert.equal(result.data?.status, 'REQUESTED')
})

test('waitForPayoutResult classifies a definite oRPC error and stops looping', async () => {
  waitForPayoutResultCall.mock.mockImplementation(async () => {
    throw new FakeORPCError('FORBIDDEN', {
      message: 'App-scoped API key required.',
      status: 403,
      data: { code: 'WAIT_FOR_PAYOUT_RESULT_APP_KEY_REQUIRED' },
    })
  })

  const result = await waitForPayoutResult({
    idempotencyKey: 'idem-forbidden',
    timeoutMs: 60_000,
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'WAIT_FOR_PAYOUT_RESULT_APP_KEY_REQUIRED')
  // Single attempt - an auth error doesn't get retried.
  assert.equal(waitForPayoutResultCall.mock.callCount(), 1)
})

test('waitForPayoutResult treats raw network errors as retryable but stops on the first one', async () => {
  waitForPayoutResultCall.mock.mockImplementation(async () => {
    throw new Error('fetch failed')
  })

  const result = await waitForPayoutResult({
    paymentId: 'pid-net',
    timeoutMs: 60_000,
  })

  assert.equal(result.data, null)
  assert.equal(result.error?.code, 'wait_for_payout_result_failed')
  assert.equal(result.error?.retryable, true)
  // We surface the failure rather than spin in a loop hitting the same wall.
  assert.equal(waitForPayoutResultCall.mock.callCount(), 1)
})
