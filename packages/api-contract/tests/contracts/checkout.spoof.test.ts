import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CreateCheckoutInputSchema } from '../../src/contracts/checkout'

describe('CreateCheckoutInputSchema sandbox compatibility', () => {
  it('accepts payload with top-level sandbox: true', () => {
    const result = CreateCheckoutInputSchema.safeParse({
      nodeId: 'n1',
      sandbox: true,
    })
    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.data.sandbox, true)
    }
  })

  it('accepts payload with top-level sandbox: false', () => {
    const result = CreateCheckoutInputSchema.safeParse({
      nodeId: 'n1',
      sandbox: false,
    })
    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.data.sandbox, false)
    }
  })

  it('accepts and strips legacy SDK-only checkout creation keys', () => {
    const result = CreateCheckoutInputSchema.safeParse({
      nodeId: 'n1',
      amount: 100,
      currency: 'USD',
      type: 'AMOUNT',
      title: 'Legacy title',
      description: 'Legacy description',
      metadata: { source: '402' },
    })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data, {
        nodeId: 'n1',
        amount: 100,
        currency: 'USD',
        metadata: { source: '402' },
      })
      assert.equal('type' in result.data, false)
      assert.equal('title' in result.data, false)
      assert.equal('description' in result.data, false)
    }
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
