import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { GetBalanceResultSchema } from '../../src/schemas/node-control'

describe('node-control schemas', () => {
  describe('GetBalanceResultSchema', () => {
    it('accepts a non-negative integer sat balance', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: 0,
          maxWithdrawableSats: null,
        }).success,
        true,
      )
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: 1_234_567,
          maxWithdrawableSats: 1_222_000,
        }).success,
        true,
      )
    })

    it('rejects negative balances', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: -1,
          maxWithdrawableSats: null,
        }).success,
        false,
      )
    })

    it('rejects fractional sats (lightning-js returns integer sats)', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: 1.5,
          maxWithdrawableSats: null,
        }).success,
        false,
      )
    })

    it('rejects missing balanceSats', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({ maxWithdrawableSats: null }).success,
        false,
      )
    })

    it('rejects non-number balanceSats', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: '1000',
          maxWithdrawableSats: null,
        }).success,
        false,
      )
    })

    it('accepts maxWithdrawableSats of 0 (dust case)', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: 5,
          maxWithdrawableSats: 0,
        }).success,
        true,
      )
    })

    it('accepts maxWithdrawableSats of null (no usable channel)', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: 0,
          maxWithdrawableSats: null,
        }).success,
        true,
      )
    })

    it('rejects missing maxWithdrawableSats', () => {
      assert.equal(GetBalanceResultSchema.safeParse({ balanceSats: 0 }).success, false)
    })

    it('rejects negative maxWithdrawableSats', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: 100,
          maxWithdrawableSats: -1,
        }).success,
        false,
      )
    })

    it('rejects fractional maxWithdrawableSats', () => {
      assert.equal(
        GetBalanceResultSchema.safeParse({
          balanceSats: 100,
          maxWithdrawableSats: 99.5,
        }).success,
        false,
      )
    })
  })
})
