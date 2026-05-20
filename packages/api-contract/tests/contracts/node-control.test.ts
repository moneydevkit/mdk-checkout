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
})
