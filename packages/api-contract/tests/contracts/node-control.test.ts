import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getBalanceContract, nodeControl } from '../../src/contracts/node-control'

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
})
