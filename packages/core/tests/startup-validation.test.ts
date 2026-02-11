import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateMnemonic } from '../src/startup-validation'

describe('validateMnemonic', () => {
  describe('valid mnemonics', () => {
    it('accepts a valid 12-word mnemonic', () => {
      const result = validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
      )
      assert.strictEqual(result.error, null)
    })

    it('accepts a valid 15-word mnemonic', () => {
      const result = validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon address'
      )
      assert.strictEqual(result.error, null)
    })

    it('accepts a valid 18-word mnemonic', () => {
      const result = validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon agent'
      )
      assert.strictEqual(result.error, null)
    })

    it('accepts a valid 21-word mnemonic', () => {
      const result = validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon admit'
      )
      assert.strictEqual(result.error, null)
    })

    it('accepts a valid 24-word mnemonic', () => {
      const result = validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
      )
      assert.strictEqual(result.error, null)
    })

    it('handles extra whitespace', () => {
      const result = validateMnemonic(
        '  abandon  abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  '
      )
      assert.strictEqual(result.error, null)
    })

    it('handles mixed case words', () => {
      const result = validateMnemonic(
        'Abandon ABANDON abandon Abandon abandon abandon abandon abandon abandon abandon abandon About'
      )
      assert.strictEqual(result.error, null)
    })

    it('handles double quotes around mnemonic', () => {
      const result = validateMnemonic(
        '"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"'
      )
      assert.strictEqual(result.error, null)
    })

    it('handles single quotes around mnemonic', () => {
      const result = validateMnemonic(
        "'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'"
      )
      assert.strictEqual(result.error, null)
    })
  })

  describe('invalid word count', () => {
    it('rejects empty string', () => {
      const result = validateMnemonic('')
      assert.notStrictEqual(result.error, null)
      assert.strictEqual(result.error?.code, 'INVALID_MNEMONIC_LENGTH')
    })

    it('rejects 11 words', () => {
      const result = validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'
      )
      assert.notStrictEqual(result.error, null)
      assert.strictEqual(result.error?.code, 'INVALID_MNEMONIC_LENGTH')
      assert.ok(result.error?.message.includes('got 11'))
    })

    it('rejects 13 words', () => {
      const result = validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'
      )
      assert.notStrictEqual(result.error, null)
      assert.strictEqual(result.error?.code, 'INVALID_MNEMONIC_LENGTH')
      assert.ok(result.error?.message.includes('got 13'))
    })
  })

  describe('invalid words', () => {
    it('rejects words not in BIP39 wordlist', () => {
      const result = validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon notaword'
      )
      assert.notStrictEqual(result.error, null)
      assert.strictEqual(result.error?.code, 'INVALID_MNEMONIC_WORDS')
      assert.ok(result.error?.message.includes('notaword'))
    })

    it('reports all invalid words', () => {
      const result = validateMnemonic(
        'foo abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon xyz'
      )
      assert.notStrictEqual(result.error, null)
      assert.strictEqual(result.error?.code, 'INVALID_MNEMONIC_WORDS')
      assert.ok(result.error?.message.includes('foo'))
      assert.ok(result.error?.message.includes('xyz'))
    })
  })
})
