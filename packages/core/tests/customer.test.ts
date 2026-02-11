import { describe, it } from 'node:test'
import assert from 'node:assert'
import { z } from 'zod'

// Replicate the input schema from the handler for testing
const GetCustomerInputSchema = z.object({
  externalId: z.string().optional(),
  email: z.string().optional(),
  customerId: z.string().optional(),
}).refine(
  (data) => {
    const fields = [data.externalId, data.email, data.customerId].filter(Boolean)
    return fields.length === 1
  },
  {
    message: 'Exactly one of externalId, email, or customerId must be provided',
  }
)

describe('GetCustomerInputSchema', () => {
  it('accepts externalId only', () => {
    const result = GetCustomerInputSchema.safeParse({ externalId: 'user_123' })
    assert.strictEqual(result.success, true)
  })

  it('accepts email only', () => {
    const result = GetCustomerInputSchema.safeParse({ email: 'test@example.com' })
    assert.strictEqual(result.success, true)
  })

  it('accepts customerId only', () => {
    const result = GetCustomerInputSchema.safeParse({ customerId: 'cust_456' })
    assert.strictEqual(result.success, true)
  })

  it('rejects empty object', () => {
    const result = GetCustomerInputSchema.safeParse({})
    assert.strictEqual(result.success, false)
    if (!result.success) {
      assert.ok(result.error.errors[0].message.includes('Exactly one'))
    }
  })

  it('rejects multiple identifiers', () => {
    const result = GetCustomerInputSchema.safeParse({
      externalId: 'user_123',
      email: 'test@example.com',
    })
    assert.strictEqual(result.success, false)
    if (!result.success) {
      assert.ok(result.error.errors[0].message.includes('Exactly one'))
    }
  })

  it('rejects all three identifiers', () => {
    const result = GetCustomerInputSchema.safeParse({
      externalId: 'user_123',
      email: 'test@example.com',
      customerId: 'cust_456',
    })
    assert.strictEqual(result.success, false)
  })

  it('ignores empty string values', () => {
    // Empty strings are falsy so they should be ignored by the filter
    const result = GetCustomerInputSchema.safeParse({
      externalId: 'user_123',
      email: '', // Empty string is falsy
    })
    assert.strictEqual(result.success, true)
  })
})
