import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveControlUrl } from '../src/handlers/webhooks'

// Minimal env required by resolveMoneyDevKitOptions() so the test can drive
// it without throwing. We only care about baseUrl resolution.
const VALID_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.MDK_ACCESS_TOKEN = 'test-token'
  process.env.MDK_MNEMONIC = VALID_MNEMONIC
  delete process.env.MDK_API_BASE_URL
  delete process.env.MDK_CONTROL_URL
  delete process.env.MDK_NETWORK
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('resolveControlUrl', () => {
  it('honors MDK_CONTROL_URL env override verbatim', () => {
    process.env.MDK_CONTROL_URL = 'ws://merchant-localtunnel:9999/something-else'
    assert.equal(
      resolveControlUrl(),
      'ws://merchant-localtunnel:9999/something-else',
    )
  })

  it('replaces the `/rpc` path with `/control` (does NOT append)', () => {
    // Regression: the previous implementation appended `/control`, yielding
    // `wss://staging.moneydevkit.com/rpc/control`. The server listens on the
    // exact path `/control` at the host root; anything else 404/502s at the
    // ALB and bubbles up as "unexpected http response 502" on the merchant.
    process.env.MDK_API_BASE_URL = 'https://staging.moneydevkit.com/rpc'
    assert.equal(
      resolveControlUrl(),
      'wss://staging.moneydevkit.com/control',
    )
  })

  it('upgrades http -> ws (local dev)', () => {
    process.env.MDK_API_BASE_URL = 'http://moneydevkit.com:8888/rpc'
    assert.equal(resolveControlUrl(), 'ws://moneydevkit.com:8888/control')
  })

  it('upgrades https -> wss (prod)', () => {
    process.env.MDK_API_BASE_URL = 'https://moneydevkit.com/rpc'
    assert.equal(resolveControlUrl(), 'wss://moneydevkit.com/control')
  })

  it('drops query and hash from baseUrl', () => {
    process.env.MDK_API_BASE_URL =
      'https://staging.moneydevkit.com/rpc?debug=1#x'
    assert.equal(
      resolveControlUrl(),
      'wss://staging.moneydevkit.com/control',
    )
  })

  it('preserves non-default ports', () => {
    process.env.MDK_API_BASE_URL = 'http://localhost:3900/rpc'
    assert.equal(resolveControlUrl(), 'ws://localhost:3900/control')
  })
})
