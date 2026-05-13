import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getBalanceContract,
  nodeControl,
  programmaticPayoutContract,
} from '../../src/contracts/node-control'
import { PayoutFailureDataSchema } from '../../src/schemas/node-control'

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
  })
})
