import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateMnemonic } from '../src/startup-validation'

describe('validateMnemonic', () => {
  it('accepts valid 12-word mnemonic', () => {
    // This is the standard BIP39 test vector
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.error, null)
  })

  it('accepts valid 24-word mnemonic', () => {
    // Another standard BIP39 test vector
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.error, null)
  })

  it('rejects empty mnemonic', () => {
    const result = validateMnemonic('')
    assert.notStrictEqual(result.error, null)
    assert.strictEqual(result.error?.code, 'mnemonic_missing')
  })

  it('rejects mnemonic with wrong word count', () => {
    const mnemonic = 'abandon abandon abandon'
    const result = validateMnemonic(mnemonic)
    assert.notStrictEqual(result.error, null)
    assert.strictEqual(result.error?.code, 'mnemonic_invalid_word_count')
    assert.ok(result.error?.message.includes('3 words'))
  })

  it('rejects mnemonic with invalid words', () => {
    // 12 words but not valid BIP39 words
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon xyz'
    const result = validateMnemonic(mnemonic)
    assert.notStrictEqual(result.error, null)
    assert.strictEqual(result.error?.code, 'mnemonic_invalid')
  })

  it('rejects mnemonic with invalid checksum', () => {
    // Valid words but wrong checksum (last word changed)
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'
    const result = validateMnemonic(mnemonic)
    assert.notStrictEqual(result.error, null)
    assert.strictEqual(result.error?.code, 'mnemonic_invalid')
  })

  it('handles extra whitespace', () => {
    const mnemonic = '  abandon  abandon   abandon abandon abandon abandon abandon abandon abandon abandon abandon about  '
    const result = validateMnemonic(mnemonic)
    assert.strictEqual(result.error, null)
  })
})
