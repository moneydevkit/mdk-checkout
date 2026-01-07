import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  validateMnemonic,
  checkVssConnectivity,
} from '../src/startup-validation'

describe('validateMnemonic', () => {
  it('accepts valid 12-word mnemonic', () => {
    // This is the standard BIP39 test vector
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.ok, true)
  })

  it('accepts valid 24-word mnemonic', () => {
    // Another standard BIP39 test vector
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.ok, true)
  })

  it('rejects empty mnemonic', () => {
    const result = validateMnemonic('')
    assert.strictEqual(result.ok, false)
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'mnemonic_missing')
    }
  })

  it('rejects mnemonic with wrong word count', () => {
    const mnemonic = 'abandon abandon abandon'
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.ok, false)
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'mnemonic_invalid_word_count')
      assert.ok(result.error.message.includes('3 words'))
    }
  })

  it('rejects mnemonic with invalid words', () => {
    // 12 words but not valid BIP39 words
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon xyz'
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.ok, false)
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'mnemonic_invalid')
    }
  })

  it('rejects mnemonic with invalid checksum', () => {
    // Valid words but wrong checksum (last word changed)
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.ok, false)
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'mnemonic_invalid')
    }
  })

  it('handles extra whitespace', () => {
    const mnemonic = '  abandon  abandon   abandon abandon abandon abandon abandon abandon abandon abandon abandon about  '
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.ok, true)
  })
})

describe('checkVssConnectivity', () => {
  it('succeeds with valid VSS URL', async () => {
    // Using the production MDK VSS
    const result = await checkVssConnectivity('https://vss.moneydevkit.com/vss')
    assert.strictEqual(result.ok, true)
  })

  it('fails with unreachable URL', async () => {
    const result = await checkVssConnectivity('https://definitely-not-a-real-vss-server.invalid')
    assert.strictEqual(result.ok, false)
    if (!result.ok) {
      assert.ok(['vss_unreachable', 'vss_timeout'].includes(result.error.code))
    }
  })

  it('fails with invalid URL format', async () => {
    const result = await checkVssConnectivity('not-a-url')
    assert.strictEqual(result.ok, false)
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'url_invalid_format')
    }
  })
})
