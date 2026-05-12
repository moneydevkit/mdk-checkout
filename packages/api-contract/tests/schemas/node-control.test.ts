import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { GetBalanceResultSchema } from '../../src/schemas/node-control'

describe('node-control schemas', () => {
  describe('GetBalanceResultSchema', () => {
    it('accepts a non-negative integer sat balance', () => {
      assert.equal(GetBalanceResultSchema.safeParse({ balanceSats: 0 }).success, true)
      assert.equal(
        GetBalanceResultSchema.safeParse({ balanceSats: 1_234_567 }).success,
        true,
      )
    })

    it('rejects negative balances', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({ balanceSats: -1 }).success,
        false,
      )
    })

    it('rejects fractional sats (lightning-js returns integer sats)', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({ balanceSats: 1.5 }).success,
        false,
      )
    })

    it('rejects missing balanceSats', () => {
      assert.equal(GetBalanceResultSchema.safeParse({}).success, false)
    })

    it('rejects non-number balanceSats', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({ balanceSats: '1000' }).success,
        false,
      )
    })
  })
})
