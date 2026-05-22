import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'

import { success, failure } from '../src/types'

const originalFetch = globalThis.fetch

const programmaticPayoutCall = mock.fn(async (_input: unknown) =>
  success({ accepted: true as const, paymentId: 'pid-1', paymentHash: 'ph-1' }),
)
const waitForPayoutResultCall = mock.fn(async (_input: unknown) =>
  success({ status: 'SUCCESS' as const, preimage: 'preimg-abc' }),
)

mock.module('../src/server', {
  namedExports: {
    programmaticPayout: programmaticPayoutCall,
    waitForPayoutResult: waitForPayoutResultCall,
  },
})

const { pay402, Pay402Error } = await import('../src/pay402')

// 1500u = 150_000 sats
const TEST_INVOICE = 'lnbc1500u1pdummyinvoice'
const TEST_MACAROON = 'AGIAJEemVQUTEyNCR0exk7ek90Cg==/abc/macaroon'

function l402Response(): Response {
  return new Response(null, {
    status: 402,
    headers: {
      'www-authenticate': `L402 macaroon="${TEST_MACAROON}", invoice="${TEST_INVOICE}"`,
    },
  })
}

function successResponse(body = 'OK'): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })
}

beforeEach(() => {
  programmaticPayoutCall.mock.resetCalls()
  waitForPayoutResultCall.mock.resetCalls()
  programmaticPayoutCall.mock.mockImplementation(async () =>
    success({ accepted: true as const, paymentId: 'pid-1', paymentHash: 'ph-1' }),
  )
  waitForPayoutResultCall.mock.mockImplementation(async () =>
    success({ status: 'SUCCESS' as const, preimage: 'preimg-abc' }),
  )
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('happy path: 402 -> programmaticPayout -> wait -> 200 with Authorization header on the replay', async () => {
  let replayHeaders: Headers | undefined
  globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (!init || !(init.headers instanceof Headers) || !init.headers.get('authorization')) {
      return l402Response()
    }
    replayHeaders = init.headers
    return successResponse('paid content')
  }) as unknown as typeof fetch

  const result = await pay402('https://example.com/protected')
  assert.equal(result.status, 200)
  assert.equal(await result.text(), 'paid content')

  // The replay must carry exactly one Authorization header in L402 form.
  assert.ok(replayHeaders, 'replay fetch missing headers')
  assert.equal(
    replayHeaders.get('authorization'),
    `L402 ${TEST_MACAROON}:preimg-abc`,
  )

  // Default idempotencyKey derived from sha256(url + ':' + macaroon).
  assert.equal(programmaticPayoutCall.mock.callCount(), 1)
  const dispatched = programmaticPayoutCall.mock.calls[0]?.arguments[0] as {
    destination: string
    idempotencyKey: string
  }
  assert.equal(dispatched.destination, TEST_INVOICE)
  // sha256 hex string, 64 chars. Stable across retries for the same URL+macaroon.
  assert.match(dispatched.idempotencyKey, /^[a-f0-9]{64}$/)

  // waitForPayoutResult uses the same key.
  const waited = waitForPayoutResultCall.mock.calls[0]?.arguments[0] as {
    idempotencyKey: string
  }
  assert.equal(waited.idempotencyKey, dispatched.idempotencyKey)
})

test('throws not_l402 when the first response is not 402', async () => {
  globalThis.fetch = mock.fn(async () => new Response('OK', { status: 200 })) as unknown as typeof fetch

  await assert.rejects(pay402('https://example.com/ok'), (err: unknown) => {
    assert.ok(err instanceof Pay402Error)
    assert.equal(err.code, 'not_l402')
    return true
  })
  // No payment dispatched on a non-L402 server.
  assert.equal(programmaticPayoutCall.mock.callCount(), 0)
})

test('throws not_l402 when WWW-Authenticate is missing', async () => {
  globalThis.fetch = mock.fn(async () =>
    new Response(null, { status: 402 }),
  ) as unknown as typeof fetch

  await assert.rejects(pay402('https://example.com/no-header'), (err: unknown) => {
    assert.ok(err instanceof Pay402Error)
    assert.equal(err.code, 'not_l402')
    return true
  })
})

test('throws not_l402 when WWW-Authenticate is not an L402 scheme', async () => {
  globalThis.fetch = mock.fn(async () =>
    new Response(null, {
      status: 402,
      headers: { 'www-authenticate': 'Basic realm="example"' },
    }),
  ) as unknown as typeof fetch

  await assert.rejects(pay402('https://example.com/basic'), (err: unknown) => {
    assert.ok(err instanceof Pay402Error)
    assert.equal(err.code, 'not_l402')
    return true
  })
})

test('throws not_l402 when L402 header is missing macaroon or invoice', async () => {
  globalThis.fetch = mock.fn(async () =>
    new Response(null, {
      status: 402,
      headers: { 'www-authenticate': 'L402 macaroon="abc"' },
    }),
  ) as unknown as typeof fetch

  await assert.rejects(pay402('https://example.com/missing-invoice'), (err: unknown) => {
    assert.ok(err instanceof Pay402Error)
    assert.equal(err.code, 'not_l402')
    return true
  })
})

test('throws amount_exceeds_max and does NOT dispatch the payment when the invoice asks for too much', async () => {
  globalThis.fetch = mock.fn(async () => l402Response()) as unknown as typeof fetch

  // Invoice is 150_000 sats; cap is 1_000.
  await assert.rejects(
    pay402('https://example.com/expensive', { maxAmountSats: 1_000 }),
    (err: unknown) => {
      assert.ok(err instanceof Pay402Error)
      assert.equal(err.code, 'amount_exceeds_max')
      return true
    },
  )
  // CRITICAL: no payment dispatched.
  assert.equal(programmaticPayoutCall.mock.callCount(), 0)
})

test('throws amount_unknown when the invoice is amountless (server bug for an L402 flow)', async () => {
  globalThis.fetch = mock.fn(async () =>
    new Response(null, {
      status: 402,
      headers: {
        'www-authenticate': `L402 macaroon="${TEST_MACAROON}", invoice="lnbc1pdummyamountless"`,
      },
    }),
  ) as unknown as typeof fetch

  await assert.rejects(pay402('https://example.com/amountless'), (err: unknown) => {
    assert.ok(err instanceof Pay402Error)
    assert.equal(err.code, 'amount_unknown')
    return true
  })
  assert.equal(programmaticPayoutCall.mock.callCount(), 0)
})

test('throws payout_failed when waitForPayoutResult returns FAILED', async () => {
  globalThis.fetch = mock.fn(async () => l402Response()) as unknown as typeof fetch
  waitForPayoutResultCall.mock.mockImplementation(async () =>
    success({ status: 'FAILED' as const, failureReason: 'RouteNotFound' }),
  )

  await assert.rejects(pay402('https://example.com/fail'), (err: unknown) => {
    assert.ok(err instanceof Pay402Error)
    assert.equal(err.code, 'payout_failed')
    assert.match(err.message, /RouteNotFound/)
    return true
  })
})

test('throws payout_timeout when waitForPayoutResult exhausts its budget with REQUESTED', async () => {
  globalThis.fetch = mock.fn(async () => l402Response()) as unknown as typeof fetch
  waitForPayoutResultCall.mock.mockImplementation(async () =>
    success({ status: 'REQUESTED' as const }),
  )

  await assert.rejects(
    pay402('https://example.com/timeout', { timeoutMs: 100 }),
    (err: unknown) => {
      assert.ok(err instanceof Pay402Error)
      assert.equal(err.code, 'payout_timeout')
      return true
    },
  )
})

test('throws l402_redeem_failed when the server returns 402 again after the Authorization header is attached', async () => {
  globalThis.fetch = mock.fn(
    async () => l402Response(),
  ) as unknown as typeof fetch

  await assert.rejects(pay402('https://example.com/wont-redeem'), (err: unknown) => {
    assert.ok(err instanceof Pay402Error)
    assert.equal(err.code, 'l402_redeem_failed')
    return true
  })
})

test('forwards a caller-supplied idempotencyKey instead of deriving from URL+macaroon', async () => {
  globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init && (init.headers as Headers | undefined)?.get?.('authorization')) {
      return successResponse('ok')
    }
    return l402Response()
  }) as unknown as typeof fetch

  await pay402('https://example.com/idem', { idempotencyKey: 'caller-key-1' })

  const dispatched = programmaticPayoutCall.mock.calls[0]?.arguments[0] as {
    idempotencyKey: string
  }
  assert.equal(dispatched.idempotencyKey, 'caller-key-1')
  const waited = waitForPayoutResultCall.mock.calls[0]?.arguments[0] as {
    idempotencyKey: string
  }
  assert.equal(waited.idempotencyKey, 'caller-key-1')
})

test('preserves caller fetchInit (method, body, custom headers) on both fetches', async () => {
  const seen: Array<{ method?: string; body?: unknown; auth: string | null }> = []
  globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers =
      init?.headers instanceof Headers ? init.headers : new Headers(init?.headers)
    seen.push({
      method: init?.method,
      body: init?.body,
      auth: headers.get('authorization'),
    })
    if (headers.get('authorization')?.startsWith('L402 ')) return successResponse('done')
    return l402Response()
  }) as unknown as typeof fetch

  await pay402('https://example.com/post', {
    fetchInit: {
      method: 'POST',
      body: '{"query":"value"}',
      headers: { 'content-type': 'application/json', 'x-custom': 'yes' },
    },
  })

  assert.equal(seen.length, 2)
  // First fetch: caller's method + body, no Authorization.
  assert.equal(seen[0]?.method, 'POST')
  assert.equal(seen[0]?.body, '{"query":"value"}')
  assert.equal(seen[0]?.auth, null)
  // Second fetch: caller's method + body preserved, Authorization added.
  assert.equal(seen[1]?.method, 'POST')
  assert.equal(seen[1]?.body, '{"query":"value"}')
  assert.equal(seen[1]?.auth, `L402 ${TEST_MACAROON}:preimg-abc`)
})

test('propagates programmaticPayout errors as payout_failed', async () => {
  globalThis.fetch = mock.fn(async () => l402Response()) as unknown as typeof fetch
  programmaticPayoutCall.mock.mockImplementation(async () =>
    failure({
      code: 'PROGRAMMATIC_PAYOUT_DAILY_LIMIT_EXCEEDED',
      message: 'daily limit',
      retryable: true,
    }),
  )

  await assert.rejects(pay402('https://example.com/cap'), (err: unknown) => {
    assert.ok(err instanceof Pay402Error)
    assert.equal(err.code, 'payout_failed')
    assert.match(err.message, /daily limit/)
    // waitForPayoutResult must not be called when dispatch fails.
    return true
  })
  assert.equal(waitForPayoutResultCall.mock.callCount(), 0)
})

test('derived idempotencyKey is deterministic across separate calls for the same URL+macaroon', async () => {
  globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers)
    if (headers.get('authorization')) return successResponse('ok')
    return l402Response()
  }) as unknown as typeof fetch

  await pay402('https://example.com/idem-stable')
  await pay402('https://example.com/idem-stable')

  const k1 = (programmaticPayoutCall.mock.calls[0]?.arguments[0] as { idempotencyKey: string })
    .idempotencyKey
  const k2 = (programmaticPayoutCall.mock.calls[1]?.arguments[0] as { idempotencyKey: string })
    .idempotencyKey
  assert.equal(k1, k2)
})
