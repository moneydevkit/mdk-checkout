import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateMnemonic } from '../src/startup-validation'

describe('validateMnemonic', () => {
  it('always returns success (validation is done server-side)', () => {
    // Valid mnemonic
    const valid = validateMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
    assert.strictEqual(valid.error, null)

    // Empty string - still succeeds (server validates)
    const empty = validateMnemonic('')
    assert.strictEqual(empty.error, null)

    // Invalid words - still succeeds (server validates)
    const invalid = validateMnemonic('foo bar baz')
    assert.strictEqual(invalid.error, null)
  })
})
