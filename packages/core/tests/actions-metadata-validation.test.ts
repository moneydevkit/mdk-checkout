import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createCheckout } from '../src/actions'

/**
 * Tests for server-side metadata validation in createCheckout.
 *
 * These tests verify that createCheckout validates metadata before
 * attempting to call the MDK API, protecting against direct API calls
 * that bypass the HTTP handlers.
 */
describe('createCheckout metadata validation', () => {
  // Base valid params for AMOUNT checkout
  const validBaseParams = {
    type: 'AMOUNT' as const,
    currency: 'USD' as const,
    amount: 1000,
  }

  it('rejects metadata with invalid key characters', async () => {
    const result = await createCheckout({
      ...validBaseParams,
      metadata: {
        'invalid key with spaces': 'value',
      },
    })

    assert.strictEqual(result.error !== undefined, true, 'Expected an error result')
    assert.strictEqual(result.error?.code, 'validation_error')
    assert.ok(result.error?.message.includes('Invalid metadata'))
  })

  it('rejects metadata with keys exceeding max length', async () => {
    const longKey = 'a'.repeat(101) // Max is 100 characters
    const result = await createCheckout({
      ...validBaseParams,
      metadata: {
        [longKey]: 'value',
      },
    })

    assert.strictEqual(result.error !== undefined, true, 'Expected an error result')
    assert.strictEqual(result.error?.code, 'validation_error')
    assert.ok(result.error?.message.includes('Invalid metadata'))
  })

  it('rejects metadata with too many keys', async () => {
    // Max is 50 keys
    const tooManyKeys: Record<string, string> = {}
    for (let i = 0; i < 51; i++) {
      tooManyKeys[`key${i}`] = 'value'
    }

    const result = await createCheckout({
      ...validBaseParams,
      metadata: tooManyKeys,
    })

    assert.strictEqual(result.error !== undefined, true, 'Expected an error result')
    assert.strictEqual(result.error?.code, 'validation_error')
    assert.ok(result.error?.message.includes('Invalid metadata'))
  })

  it('rejects metadata exceeding max size', async () => {
    // Max total size is 1024 bytes
    const largeValue = 'x'.repeat(2000)
    const result = await createCheckout({
      ...validBaseParams,
      metadata: {
        key: largeValue,
      },
    })

    assert.strictEqual(result.error !== undefined, true, 'Expected an error result')
    assert.strictEqual(result.error?.code, 'validation_error')
    assert.ok(result.error?.message.includes('Invalid metadata'))
  })

  it('rejects metadata with control characters in value', async () => {
    const result = await createCheckout({
      ...validBaseParams,
      metadata: {
        key: 'value\x00with\x01control\x02chars',
      },
    })

    assert.strictEqual(result.error !== undefined, true, 'Expected an error result')
    assert.strictEqual(result.error?.code, 'validation_error')
    assert.ok(result.error?.message.includes('Invalid metadata'))
  })

  it('rejects metadata with special characters in key', async () => {
    const result = await createCheckout({
      ...validBaseParams,
      metadata: {
        'key@with#special$chars': 'value',
      },
    })

    assert.strictEqual(result.error !== undefined, true, 'Expected an error result')
    assert.strictEqual(result.error?.code, 'validation_error')
    assert.ok(result.error?.message.includes('Invalid metadata'))
  })
})
