import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateMetadata,
  MAX_METADATA_SIZE_BYTES,
  MAX_KEY_LENGTH,
  MAX_KEY_COUNT,
} from './checkout-validation.js'

test('returns ok for undefined metadata', () => {
  const result = validateMetadata(undefined)
  assert.equal(result.ok, true)
})

test('returns ok for empty metadata object', () => {
  const result = validateMetadata({})
  assert.equal(result.ok, true)
})

test('returns ok for valid metadata', () => {
  const metadata = {
    customerName: 'John Doe',
    product: 'Lightning download',
    note: 'Fast checkout',
  }
  const result = validateMetadata(metadata)
  assert.equal(result.ok, true)
})

// Size validation tests
test('returns error for metadata exceeding 1KB limit', () => {
  const largeValue = 'x'.repeat(MAX_METADATA_SIZE_BYTES)
  const metadata = {
    data: largeValue,
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'size_exceeded')
  assert.ok(result.error[0].message.includes('exceeds maximum allowed size'))
})

test('handles multiple fields that together exceed limit', () => {
  const metadata = {
    field1: 'x'.repeat(600),
    field2: 'y'.repeat(600),
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'size_exceeded')
})

test('includes actual size in error details', () => {
  const largeValue = 'x'.repeat(MAX_METADATA_SIZE_BYTES + 1)
  const metadata = {
    data: largeValue,
  }

  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'size_exceeded')
  assert.ok(result.error[0].message.includes('bytes'))
})

// Reserved key tests
test('rejects reserved key "title"', () => {
  const metadata = {
    title: 'Should not be allowed',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'reserved_key')
  assert.ok(result.error[0].message.includes('reserved'))
  assert.ok(result.error[0].message.includes('title'))
})

test('rejects reserved key "description"', () => {
  const metadata = {
    description: 'Should not be allowed',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'reserved_key')
  assert.ok(result.error[0].message.includes('description'))
})

test('rejects reserved key "successUrl"', () => {
  const metadata = {
    successUrl: 'https://example.com',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'reserved_key')
  assert.ok(result.error[0].message.includes('successUrl'))
})

// Key format tests
test('rejects key with special characters', () => {
  const metadata = {
    'invalid@key': 'value',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'invalid_key_format')
  assert.ok(result.error[0].message.includes('invalid characters'))
  assert.ok(result.error[0].message.includes('invalid@key'))
})

test('rejects key with spaces', () => {
  const metadata = {
    'invalid key': 'value',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'invalid_key_format')
})

test('rejects key with dots', () => {
  const metadata = {
    'invalid.key': 'value',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'invalid_key_format')
})

test('accepts valid key formats', () => {
  const metadata = {
    valid_key: 'value',
    'valid-key': 'value',
    validKey123: 'value',
    VALID_KEY: 'value',
  }
  const result = validateMetadata(metadata)
  assert.equal(result.ok, true)
})

test('rejects empty key', () => {
  const metadata = {
    '': 'value',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'invalid_key_format')
})

// Key length tests
test('rejects key exceeding maximum length', () => {
  const longKey = 'x'.repeat(MAX_KEY_LENGTH + 1)
  const metadata = {
    [longKey]: 'value',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'key_too_long')
  assert.ok(result.error[0].message.includes('exceeds maximum length'))
})

test('accepts key at maximum length', () => {
  const maxKey = 'x'.repeat(MAX_KEY_LENGTH)
  const metadata = {
    [maxKey]: 'value',
  }
  const result = validateMetadata(metadata)
  assert.equal(result.ok, true)
})

// Key count tests
test('rejects metadata with too many keys', () => {
  const metadata: Record<string, string> = {}
  for (let i = 0; i < MAX_KEY_COUNT + 1; i++) {
    metadata[`key${i}`] = 'value'
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'key_count_exceeded')
  assert.ok(result.error[0].message.includes('exceeds the maximum'))
})

test('accepts metadata at maximum key count', () => {
  const metadata: Record<string, string> = {}
  for (let i = 0; i < MAX_KEY_COUNT; i++) {
    metadata[`key${i}`] = 'value'
  }
  const result = validateMetadata(metadata)
  assert.equal(result.ok, true)
})

// Value encoding tests
test('rejects value with null bytes', () => {
  const metadata = {
    key: 'value\0with\0null',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'control_character')
  assert.ok(result.error[0].message.includes('null bytes'))
  assert.ok(result.error[0].message.includes('key'))
})

test('rejects value with control characters', () => {
  const metadata = {
    key: 'value\x01control',
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.equal(result.error.length, 1)
  assert.equal(result.error[0].type, 'control_character')
})

test('accepts value with newline', () => {
  const metadata = {
    note: 'Line 1\nLine 2',
  }
  const result = validateMetadata(metadata)
  assert.equal(result.ok, true)
})

test('accepts value with tab', () => {
  const metadata = {
    note: 'Column1\tColumn2',
  }
  const result = validateMetadata(metadata)
  assert.equal(result.ok, true)
})

test('accepts value with carriage return', () => {
  const metadata = {
    note: 'Line 1\rLine 2',
  }
  const result = validateMetadata(metadata)
  assert.equal(result.ok, true)
})

test('accepts unicode characters', () => {
  const metadata = {
    name: 'José',
    emoji: '⚡',
    chinese: '中文',
  }
  const result = validateMetadata(metadata)
  assert.equal(result.ok, true)
})

// Combined validation tests
test('validates all constraints in order', () => {
  const metadata = {
    title: 'x'.repeat(2000), // Would exceed size, and is also a reserved key
    note: 'value\x01control', // Would contain control characters
  }
  const result = validateMetadata(metadata)

  assert.equal(result.ok, false)
  assert.ok(result.error.length >= 1)
  assert.ok(result.error[0].type === 'reserved_key')
  assert.ok(result.error[1].type === 'control_character')
  assert.ok(result.error[2].type === 'size_exceeded')
})


