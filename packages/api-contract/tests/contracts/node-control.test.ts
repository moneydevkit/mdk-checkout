import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getBalanceContract,
  nodeControl,
  programmaticPayoutContract,
} from '../../src/contracts/node-control'
import {
  NodeEventSchema,
  PayoutFailureDataSchema,
  PayoutInputSchema,
  ProgrammaticPayoutInputSchema,
} from '../../src/schemas/node-control'

describe('node-control contracts', () => {
  describe('getBalanceContract', () => {
    it('is exported as an oRPC contract object', () => {
      assert.ok(getBalanceContract)
      assert.equal(typeof getBalanceContract, 'object')
    })

    it('is wired into the nodeControl namespace as getBalance', () => {
      const router = nodeControl as Record<string, unknown>
      assert.equal('getBalance' in router, true)
      assert.equal(router.getBalance, getBalanceContract)
    })
  })

  describe('programmaticPayoutContract', () => {
    it('declares payout command errors so downstream messages are preserved', () => {
      const errorMap = programmaticPayoutContract['~orpc'].errorMap

      assert.ok(errorMap.PAYOUT_FAILED)
      assert.equal(errorMap.PAYOUT_FAILED.message, 'payout failed')
      assert.equal(errorMap.PAYOUT_FAILED.data, PayoutFailureDataSchema)
      assert.equal(
        PayoutFailureDataSchema.safeParse({ reason: 'route not found' }).success,
        true,
      )
      assert.equal(
        PayoutFailureDataSchema.safeParse({ reason: '' }).success,
        false,
      )
    })

    it('is wired into the nodeControl namespace as programmaticPayout', () => {
      assert.equal(nodeControl.programmaticPayout, programmaticPayoutContract)
    })

    it('requires payoutId on node-control programmatic payout input', () => {
      assert.equal(
        ProgrammaticPayoutInputSchema.safeParse({
          payoutId: 'pp_123',
          amountMsat: 1000,
          destination: 'lnbc1...',
          idempotencyKey: 'idem_123',
        }).success,
        true,
      )
      assert.equal(
        ProgrammaticPayoutInputSchema.safeParse({
          amountMsat: 1000,
          destination: 'lnbc1...',
          idempotencyKey: 'idem_123',
        }).success,
        false,
      )
    })

    it('requires payoutId on programmatic payout terminal events', () => {
      assert.equal(
        NodeEventSchema.safeParse({
          type: 'programmaticPayoutSent',
          payoutId: 'pp_123',
          paymentId: 'pay_123',
          paymentHash: 'hash_123',
          preimage: 'preimage_123',
        }).success,
        true,
      )
      assert.equal(
        NodeEventSchema.safeParse({
          type: 'programmaticPayoutFailed',
          paymentId: 'pay_123',
          paymentHash: 'hash_123',
          reason: 'route not found',
        }).success,
        false,
      )
    })
  })

  describe('PayoutInputSchema (legacy payout)', () => {
    it('accepts input WITHOUT withdrawalId for backward compatibility', () => {
      // Old mdk.com versions and the legacy HTTP fallback do not set
      // withdrawalId; the contract must keep accepting them.
      assert.equal(
        PayoutInputSchema.safeParse({
          amountMsat: 1000,
          idempotencyKey: 'idem_1',
        }).success,
        true,
      )
    })

    it('accepts input WITH withdrawalId for the reconcile-by-PK flow', () => {
      assert.equal(
        PayoutInputSchema.safeParse({
          withdrawalId: 'w_123',
          amountMsat: 1000,
          idempotencyKey: 'idem_1',
        }).success,
        true,
      )
    })

    it('rejects empty-string withdrawalId so the merchant never echoes a useless empty value', () => {
      assert.equal(
        PayoutInputSchema.safeParse({
          withdrawalId: '',
          amountMsat: 1000,
          idempotencyKey: 'idem_1',
        }).success,
        false,
      )
    })
  })

  describe('withdrawal terminal events', () => {
    it('accepts withdrawalSent with withdrawalId, paymentId, paymentHash, preimage', () => {
      assert.equal(
        NodeEventSchema.safeParse({
          type: 'withdrawalSent',
          withdrawalId: 'w_123',
          paymentId: 'pay_123',
          paymentHash: 'hash_123',
          preimage: 'preimage_123',
        }).success,
        true,
      )
    })

    it('rejects withdrawalSent without withdrawalId', () => {
      assert.equal(
        NodeEventSchema.safeParse({
          type: 'withdrawalSent',
          paymentId: 'pay_123',
          paymentHash: 'hash_123',
          preimage: 'preimage_123',
        }).success,
        false,
      )
    })

    it('accepts withdrawalFailed with optional reason', () => {
      assert.equal(
        NodeEventSchema.safeParse({
          type: 'withdrawalFailed',
          withdrawalId: 'w_123',
          paymentId: 'pay_123',
          paymentHash: 'hash_123',
          reason: 'route not found',
        }).success,
        true,
      )
      // reason is optional - omitted should also parse.
      assert.equal(
        NodeEventSchema.safeParse({
          type: 'withdrawalFailed',
          withdrawalId: 'w_123',
          paymentId: 'pay_123',
          paymentHash: 'hash_123',
        }).success,
        true,
      )
    })

    it('rejects withdrawalFailed without withdrawalId', () => {
      assert.equal(
        NodeEventSchema.safeParse({
          type: 'withdrawalFailed',
          paymentId: 'pay_123',
          paymentHash: 'hash_123',
        }).success,
        false,
      )
    })
  })
})
