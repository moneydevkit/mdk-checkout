import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

let requests: Array<{ url: string | URL | Request; init?: RequestInit }> = []

beforeEach(() => {
  process.env = { ...originalEnv }
  requests = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url, init })
    return new Response(JSON.stringify({ data: { id: 'checkout-client-preview' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
})

afterEach(() => {
  process.env = { ...originalEnv }
  globalThis.fetch = originalFetch
})

describe('clientCreateCheckout sandbox forwarding', () => {
  it('forwards sandbox=true when NEXT_PUBLIC_MDK_PREVIEW=true', async () => {
    process.env.NEXT_PUBLIC_MDK_PREVIEW = 'true'

    const { clientCreateCheckout } = await import('../src/client-actions')
    const result = await clientCreateCheckout({
      type: 'AMOUNT',
      amount: 100,
      currency: 'SAT',
    })

    assert.equal(result.error, null)
    assert.equal(requests.length, 1)
    const body = JSON.parse(String(requests[0]?.init?.body))
    assert.deepEqual(body, {
      handler: 'create_checkout',
      params: {
        type: 'AMOUNT',
        amount: 100,
        currency: 'SAT',
        sandbox: true,
      },
    })
  })

  it('omits sandbox when preview is disabled and no explicit sandbox was provided', async () => {
    delete process.env.NEXT_PUBLIC_MDK_PREVIEW
    delete process.env.MDK_PREVIEW

    const { clientCreateCheckout } = await import('../src/client-actions')
    const result = await clientCreateCheckout({
      type: 'AMOUNT',
      amount: 100,
      currency: 'SAT',
    })

    assert.equal(result.error, null)
    const body = JSON.parse(String(requests[0]?.init?.body))
    assert.equal('sandbox' in body.params, false)
  })
})
