import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CreateCheckoutInputSchema } from '../../src/contracts/checkout'

describe('CreateCheckoutInputSchema sandbox spoof guard', () => {
  it('rejects payload with top-level sandbox: true', () => {
    const result = CreateCheckoutInputSchema.safeParse({
      nodeId: 'n1',
      sandbox: true,
    })
    assert.equal(result.success, false)
  })

  it('rejects payload with top-level sandbox: false (strict object rejects unknown keys)', () => {
    const result = CreateCheckoutInputSchema.safeParse({
      nodeId: 'n1',
      sandbox: false,
    })
    assert.equal(result.success, false)
  })

  it("accepts payload with metadata.sandbox = 'true' (L402 bridge path)", () => {
    const result = CreateCheckoutInputSchema.safeParse({
      nodeId: 'n1',
      metadata: { sandbox: 'true', source: '402' },
    })
    assert.equal(result.success, true)
  })

  it('accepts a minimal valid payload (no sandbox anywhere)', () => {
    const result = CreateCheckoutInputSchema.safeParse({ nodeId: 'n1' })
    assert.equal(result.success, true)
  })
})
