import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'crypto'

import {
  createL402Credential,
  verifyL402Credential,
  verifyPreimage,
  parseAuthorizationHeader,
  deriveL402Key,
} from '../src/mdk402/token'

const TEST_ACCESS_TOKEN = 'test-secret-token-for-mdk402-testing'
const TEST_RESOURCE = 'GET:/api/test'

// Known preimage/hash pair for testing:
// preimage = '0000000000000000000000000000000000000000000000000000000000000001'
// SHA256(preimage) = paymentHash
const TEST_PREIMAGE = '0000000000000000000000000000000000000000000000000000000000000001'
const TEST_PAYMENT_HASH = createHash('sha256')
  .update(Buffer.from(TEST_PREIMAGE, 'hex'))
  .digest('hex')

function futureTimestamp(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds
}

function pastTimestamp(seconds: number): number {
  return Math.floor(Date.now() / 1000) - seconds
}

describe('deriveL402Key', () => {
  it('returns a 32-byte buffer', () => {
    const key = deriveL402Key(TEST_ACCESS_TOKEN)
    assert.equal(key.length, 32)
    assert.ok(Buffer.isBuffer(key))
  })

  it('returns different keys for different access tokens', () => {
    const key1 = deriveL402Key('token-a')
    const key2 = deriveL402Key('token-b')
    assert.notDeepEqual(key1, key2)
  })

  it('is deterministic', () => {
    const key1 = deriveL402Key(TEST_ACCESS_TOKEN)
    const key2 = deriveL402Key(TEST_ACCESS_TOKEN)
    assert.deepEqual(key1, key2)
  })
})

describe('createL402Credential and verifyL402Credential', () => {
  it('roundtrip: create then verify succeeds', () => {
    const expiresAt = futureTimestamp(900)
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt,
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 100,
      currency: 'SAT',
    })

    const result = verifyL402Credential(credential, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.paymentHash, TEST_PAYMENT_HASH)
      assert.equal(result.amountSats, 100)
      assert.equal(result.expiresAt, expiresAt)
      assert.equal(result.resource, TEST_RESOURCE)
      assert.equal(result.amount, 100)
      assert.equal(result.currency, 'SAT')
    }
  })

  it('returns base64-encoded JSON', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 50,
      expiresAt: futureTimestamp(900),
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 5,
      currency: 'USD',
    })

    const decoded = JSON.parse(Buffer.from(credential, 'base64').toString('utf8'))
    assert.equal(decoded.paymentHash, TEST_PAYMENT_HASH)
    assert.equal(decoded.amountSats, 50)
    assert.equal(decoded.resource, TEST_RESOURCE)
    assert.equal(decoded.amount, 5)
    assert.equal(decoded.currency, 'USD')
    assert.equal(typeof decoded.sig, 'string')
    assert.equal(typeof decoded.expiresAt, 'number')
  })

  it('rejects credential verified with wrong access token', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt: futureTimestamp(900),
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 100,
      currency: 'SAT',
    })

    const result = verifyL402Credential(credential, 'wrong-access-token')
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_signature')
    }
  })

  it('rejects expired credential', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt: pastTimestamp(10),
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 100,
      currency: 'SAT',
    })

    const result = verifyL402Credential(credential, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'expired')
    }
  })

  it('rejects credential with tampered paymentHash', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt: futureTimestamp(900),
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 100,
      currency: 'SAT',
    })

    // Tamper with the payload
    const decoded = JSON.parse(Buffer.from(credential, 'base64').toString('utf8'))
    decoded.paymentHash = 'aaaa' + decoded.paymentHash.slice(4)
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')

    const result = verifyL402Credential(tampered, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_signature')
    }
  })

  it('rejects credential with tampered amountSats', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt: futureTimestamp(900),
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 100,
      currency: 'SAT',
    })

    const decoded = JSON.parse(Buffer.from(credential, 'base64').toString('utf8'))
    decoded.amountSats = 999999
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')

    const result = verifyL402Credential(tampered, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_signature')
    }
  })

  it('rejects credential with tampered resource', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt: futureTimestamp(900),
      accessToken: TEST_ACCESS_TOKEN,
      resource: 'GET:/api/cheap',
      amount: 100,
      currency: 'SAT',
    })

    const decoded = JSON.parse(Buffer.from(credential, 'base64').toString('utf8'))
    decoded.resource = 'GET:/api/expensive'
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')

    const result = verifyL402Credential(tampered, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_signature')
    }
  })

  it('rejects credential with tampered signature', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt: futureTimestamp(900),
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 100,
      currency: 'SAT',
    })

    const decoded = JSON.parse(Buffer.from(credential, 'base64').toString('utf8'))
    decoded.sig = 'a'.repeat(64) // fake sig, same length
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')

    const result = verifyL402Credential(tampered, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_signature')
    }
  })

  it('rejects credential with tampered amount', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt: futureTimestamp(900),
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 100,
      currency: 'SAT',
    })

    const decoded = JSON.parse(Buffer.from(credential, 'base64').toString('utf8'))
    decoded.amount = 1
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')

    const result = verifyL402Credential(tampered, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_signature')
    }
  })

  it('rejects credential with tampered currency', () => {
    const credential = createL402Credential({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt: futureTimestamp(900),
      accessToken: TEST_ACCESS_TOKEN,
      resource: TEST_RESOURCE,
      amount: 100,
      currency: 'SAT',
    })

    const decoded = JSON.parse(Buffer.from(credential, 'base64').toString('utf8'))
    decoded.currency = 'USD'
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')

    const result = verifyL402Credential(tampered, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_signature')
    }
  })

  it('rejects credential without resource field', () => {
    // Simulate an old-format credential without resource, amount, or currency
    const key = deriveL402Key(TEST_ACCESS_TOKEN)
    const expiresAt = futureTimestamp(900)
    const message = `${TEST_PAYMENT_HASH}:100:${expiresAt}`
    const sig = createHmac('sha256', key).update(message).digest('hex')
    const oldCredential = Buffer.from(JSON.stringify({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt,
      sig,
    })).toString('base64')

    const result = verifyL402Credential(oldCredential, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_format')
    }
  })

  it('rejects credential without amount/currency fields', () => {
    // Credential with resource but missing amount/currency
    const key = deriveL402Key(TEST_ACCESS_TOKEN)
    const expiresAt = futureTimestamp(900)
    const message = `${TEST_PAYMENT_HASH}:100:${expiresAt}:${TEST_RESOURCE}`
    const sig = createHmac('sha256', key).update(message).digest('hex')
    const oldCredential = Buffer.from(JSON.stringify({
      paymentHash: TEST_PAYMENT_HASH,
      amountSats: 100,
      expiresAt,
      resource: TEST_RESOURCE,
      sig,
    })).toString('base64')

    const result = verifyL402Credential(oldCredential, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_format')
    }
  })

  it('rejects completely invalid base64', () => {
    const result = verifyL402Credential('not-valid-base64!!!', TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_format')
    }
  })

  it('rejects valid base64 but invalid JSON', () => {
    const credential = Buffer.from('not json at all').toString('base64')
    const result = verifyL402Credential(credential, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_format')
    }
  })

  it('rejects credential with missing fields', () => {
    const incomplete = Buffer.from(JSON.stringify({ paymentHash: 'abc' })).toString('base64')
    const result = verifyL402Credential(incomplete, TEST_ACCESS_TOKEN)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.equal(result.reason, 'invalid_format')
    }
  })
})

describe('verifyPreimage', () => {
  it('returns true for a valid preimage', () => {
    assert.equal(verifyPreimage(TEST_PREIMAGE, TEST_PAYMENT_HASH), true)
  })

  it('returns false for wrong preimage', () => {
    const wrongPreimage = '0000000000000000000000000000000000000000000000000000000000000002'
    assert.equal(verifyPreimage(wrongPreimage, TEST_PAYMENT_HASH), false)
  })

  it('returns false for empty preimage', () => {
    assert.equal(verifyPreimage('', TEST_PAYMENT_HASH), false)
  })

  it('returns false for non-hex preimage', () => {
    assert.equal(verifyPreimage('not-hex-data', TEST_PAYMENT_HASH), false)
  })

  it('returns false for empty paymentHash', () => {
    assert.equal(verifyPreimage(TEST_PREIMAGE, ''), false)
  })
})

describe('parseAuthorizationHeader', () => {
  it('parses a valid L402 header', () => {
    const result = parseAuthorizationHeader('L402 mymacaroon123:mypreimage456')
    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.macaroon, 'mymacaroon123')
      assert.equal(result.preimage, 'mypreimage456')
    }
  })

  it('handles case-insensitive L402 scheme', () => {
    const result = parseAuthorizationHeader('l402 macaroon:preimage')
    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.macaroon, 'macaroon')
      assert.equal(result.preimage, 'preimage')
    }
  })

  it('handles mixed case L402 scheme', () => {
    const result = parseAuthorizationHeader('L402 macaroon:preimage')
    assert.equal(result.valid, true)
  })

  it('accepts legacy LSAT scheme', () => {
    const result = parseAuthorizationHeader('LSAT mymacaroon:mypreimage')
    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.macaroon, 'mymacaroon')
      assert.equal(result.preimage, 'mypreimage')
    }
  })

  it('accepts case-insensitive LSAT scheme', () => {
    const result = parseAuthorizationHeader('lsat macaroon:preimage')
    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.macaroon, 'macaroon')
      assert.equal(result.preimage, 'preimage')
    }
  })

  it('returns invalid for null header', () => {
    const result = parseAuthorizationHeader(null)
    assert.equal(result.valid, false)
  })

  it('returns invalid for empty string', () => {
    const result = parseAuthorizationHeader('')
    assert.equal(result.valid, false)
  })

  it('returns invalid for wrong scheme', () => {
    const result = parseAuthorizationHeader('Bearer macaroon:preimage')
    assert.equal(result.valid, false)
  })

  it('rejects legacy MDK402 scheme', () => {
    const result = parseAuthorizationHeader('MDK402 token:preimage')
    assert.equal(result.valid, false)
  })

  it('returns invalid for missing colon', () => {
    const result = parseAuthorizationHeader('L402 macaroononly')
    assert.equal(result.valid, false)
  })

  it('returns invalid for empty macaroon part', () => {
    const result = parseAuthorizationHeader('L402 :preimage')
    assert.equal(result.valid, false)
  })

  it('returns invalid for empty preimage part', () => {
    const result = parseAuthorizationHeader('L402 macaroon:')
    assert.equal(result.valid, false)
  })

  it('handles extra whitespace after scheme', () => {
    const result = parseAuthorizationHeader('L402   macaroon:preimage')
    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.macaroon, 'macaroon')
      assert.equal(result.preimage, 'preimage')
    }
  })

  it('uses first colon as separator (preimage may contain colons)', () => {
    const result = parseAuthorizationHeader('L402 macaroon:preimage:with:colons')
    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.macaroon, 'macaroon')
      assert.equal(result.preimage, 'preimage:with:colons')
    }
  })
})
