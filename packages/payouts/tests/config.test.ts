import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'

import {
  getPayoutConfig,
  getPayoutLimits,
  getPayoutSecret,
  __resetConfigCache,
} from '../src/config'

describe('getPayoutConfig', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    __resetConfigCache()
    // Clear relevant env vars
    delete process.env.MDK_PAYOUT_SECRET
    delete process.env.MDK_PAYOUT_ALLOWED_DESTINATIONS
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    __resetConfigCache()
  })

  it('returns null secret when MDK_PAYOUT_SECRET is missing', () => {
    const config = getPayoutConfig()
    assert.strictEqual(config.secret, null)
  })

  it('returns secret when set', () => {
    process.env.MDK_PAYOUT_SECRET = 'test-secret'

    const config = getPayoutConfig()
    assert.strictEqual(config.secret, 'test-secret')
  })

  it('parses allowed destinations', () => {
    process.env.MDK_PAYOUT_ALLOWED_DESTINATIONS = 'lno1abc,user@wallet.com,*.domain.com'

    const config = getPayoutConfig()

    assert.deepStrictEqual(config.allowedDestinations, [
      'lno1abc',
      'user@wallet.com',
      '*.domain.com',
    ])
  })

  it('returns null allowedDestinations when not set', () => {
    const config = getPayoutConfig()
    assert.strictEqual(config.allowedDestinations, null)
  })
})

describe('getPayoutSecret', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.MDK_PAYOUT_SECRET
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns null when not set', () => {
    assert.strictEqual(getPayoutSecret(), null)
  })

  it('returns secret when set', () => {
    process.env.MDK_PAYOUT_SECRET = 'my-secret'
    assert.strictEqual(getPayoutSecret(), 'my-secret')
  })
})

describe('getPayoutLimits', () => {
  it('returns default limits', () => {
    const limits = getPayoutLimits()

    assert.strictEqual(limits.maxSinglePayment, 10_000)
    assert.strictEqual(limits.maxDaily, 100_000)
    assert.strictEqual(limits.maxHourly, 50_000)
    assert.strictEqual(limits.rateLimit, 10)
    assert.strictEqual(limits.rateLimitWindow, 60_000)
  })
})
