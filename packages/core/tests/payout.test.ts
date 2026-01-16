import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { handlePayout } from '../src/handlers/payout'
import { __resetDeprecationWarnings } from '../src/payout-address'

const originalEnv = { ...process.env }

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/mdk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env = { ...originalEnv }
  delete process.env.PAYOUT_ADDRESS
  delete process.env.WITHDRAWAL_BOLT_11
  delete process.env.WITHDRAWAL_BOLT_12
  delete process.env.WITHDRAWAL_LNURL
  __resetDeprecationWarnings()
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('handlePayout', () => {
  test('returns 400 for missing amount', async () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com'
    const res = await handlePayout(makeRequest({}))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'Invalid payout request')
  })

  test('returns 400 for invalid amount', async () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com'
    const res = await handlePayout(makeRequest({ amount: -100 }))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'Invalid payout request')
  })

  test('returns 400 for zero amount', async () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com'
    const res = await handlePayout(makeRequest({ amount: 0 }))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'Invalid payout request')
  })

  test('returns 500 when PAYOUT_ADDRESS not configured', async () => {
    const res = await handlePayout(makeRequest({ amount: 1000 }))
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.ok(body.error.includes('Payout address not configured'))
  })

  test('returns 500 when only invalid PAYOUT_ADDRESS format is set', async () => {
    process.env.PAYOUT_ADDRESS = 'invalid-address-format'
    const res = await handlePayout(makeRequest({ amount: 1000 }))
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.ok(body.error.includes('Payout address not configured'))
  })
})
