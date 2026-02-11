import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateMetadata,
  MAX_METADATA_SIZE_BYTES,
  MAX_KEY_LENGTH,
  MAX_KEY_COUNT,
} from '../../src/validation/metadata-validation'

describe('validateMetadata', () => {
  it('returns ok for undefined metadata', () => {
    const result = validateMetadata(undefined)
    assert.equal(result.ok, true)
  })

  it('returns ok for empty metadata object', () => {
    const result = validateMetadata({})
    assert.equal(result.ok, true)
  })

  it('returns ok for valid metadata', () => {
    const metadata = {
      customerName: 'John Doe',
      product: 'Lightning download',
      note: 'Fast checkout',
    }
    const result = validateMetadata(metadata)
    assert.equal(result.ok, true)
  })

  // Size validation tests
  describe('size validation', () => {
    it('returns error for metadata exceeding 1KB limit', () => {
      const largeValue = 'x'.repeat(MAX_METADATA_SIZE_BYTES)
      const metadata = {
        data: largeValue,
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'size_exceeded')
        assert.ok(result.error[0].message.includes('exceeds maximum allowed size'))
      }
    })

    it('handles multiple fields that together exceed limit', () => {
      const metadata = {
        field1: 'x'.repeat(600),
        field2: 'y'.repeat(600),
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'size_exceeded')
      }
    })

    it('includes actual size in error details', () => {
      const largeValue = 'x'.repeat(MAX_METADATA_SIZE_BYTES + 1)
      const metadata = {
        data: largeValue,
      }

      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'size_exceeded')
        assert.ok(result.error[0].message.includes('bytes'))
      }
    })
  })

  // Key format tests
  describe('key format validation', () => {
    it('rejects key with special characters', () => {
      const metadata = {
        'invalid@key': 'value',
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'invalid_key_format')
        assert.ok(result.error[0].message.includes('invalid characters'))
        assert.ok(result.error[0].message.includes('invalid@key'))
      }
    })

    it('rejects key with spaces', () => {
      const metadata = {
        'invalid key': 'value',
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'invalid_key_format')
      }
    })

    it('rejects key with dots', () => {
      const metadata = {
        'invalid.key': 'value',
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'invalid_key_format')
      }
    })

    it('accepts valid key formats', () => {
      const metadata = {
        valid_key: 'value',
        'valid-key': 'value',
        validKey123: 'value',
        VALID_KEY: 'value',
      }
      const result = validateMetadata(metadata)
      assert.equal(result.ok, true)
    })

    it('rejects empty key', () => {
      const metadata = {
        '': 'value',
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'invalid_key_format')
      }
    })
  })

  // Key length tests
  describe('key length validation', () => {
    it('rejects key exceeding maximum length', () => {
      const longKey = 'x'.repeat(MAX_KEY_LENGTH + 1)
      const metadata = {
        [longKey]: 'value',
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'key_too_long')
        assert.ok(result.error[0].message.includes('exceeds maximum length'))
      }
    })

    it('accepts key at maximum length', () => {
      const maxKey = 'x'.repeat(MAX_KEY_LENGTH)
      const metadata = {
        [maxKey]: 'value',
      }
      const result = validateMetadata(metadata)
      assert.equal(result.ok, true)
    })
  })

  // Key count tests
  describe('key count validation', () => {
    it('rejects metadata with too many keys', () => {
      const metadata: Record<string, string> = {}
      for (let i = 0; i < MAX_KEY_COUNT + 1; i++) {
        metadata[`key${i}`] = 'value'
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'key_count_exceeded')
        assert.ok(result.error[0].message.includes('exceeds the maximum'))
      }
    })

    it('accepts metadata at maximum key count', () => {
      const metadata: Record<string, string> = {}
      for (let i = 0; i < MAX_KEY_COUNT; i++) {
        metadata[`key${i}`] = 'value'
      }
      const result = validateMetadata(metadata)
      assert.equal(result.ok, true)
    })
  })

  // Value encoding tests
  describe('value encoding validation', () => {
    it('rejects value with null bytes', () => {
      const metadata = {
        key: 'value\0with\0null',
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'control_character')
        assert.ok(result.error[0].message.includes('null bytes'))
        assert.ok(result.error[0].message.includes('key'))
      }
    })

    it('rejects value with control characters', () => {
      const metadata = {
        key: 'value\x01control',
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.error.length, 1)
        assert.equal(result.error[0].type, 'control_character')
      }
    })

    it('accepts value with newline', () => {
      const metadata = {
        note: 'Line 1\nLine 2',
      }
      const result = validateMetadata(metadata)
      assert.equal(result.ok, true)
    })

    it('accepts value with tab', () => {
      const metadata = {
        note: 'Column1\tColumn2',
      }
      const result = validateMetadata(metadata)
      assert.equal(result.ok, true)
    })

    it('accepts value with carriage return', () => {
      const metadata = {
        note: 'Line 1\rLine 2',
      }
      const result = validateMetadata(metadata)
      assert.equal(result.ok, true)
    })

    it('accepts unicode characters', () => {
      const metadata = {
        name: 'José',
        emoji: '⚡',
        chinese: '中文',
      }
      const result = validateMetadata(metadata)
      assert.equal(result.ok, true)
    })
  })

  // Combined validation tests
  describe('combined validation', () => {
    it('validates all constraints and returns multiple errors', () => {
      const metadata = {
        'invalid@key': 'value\x01control', // Invalid key format and control character
        'another-key': 'x'.repeat(MAX_METADATA_SIZE_BYTES), // Would exceed size
      }
      const result = validateMetadata(metadata)

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.ok(result.error.length >= 2)
        const errorTypes = result.error.map((e) => e.type)
        assert.ok(errorTypes.includes('invalid_key_format'))
        assert.ok(errorTypes.includes('control_character'))
        assert.ok(errorTypes.includes('size_exceeded'))
      }
    })
  })
})
