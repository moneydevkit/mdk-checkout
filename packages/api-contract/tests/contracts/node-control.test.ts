import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getBalanceContract, nodeControl } from '../../src/contracts/node-control'

describe('node-control contracts', () => {
  describe('getBalanceContract', () => {
    it('is exported as an oRPC contract object', () => {
      assert.ok(getBalanceContract)
      assert.equal(typeof getBalanceContract, 'object')
    })

    it('is intentionally NOT yet wired into the nodeControl router', () => {
      // Keep this assertion red until the implementation PR lands the SDK
      // handler. Adding `getBalance` to `nodeControl` without the matching
      // handler in @moneydevkit/core would break the workspace build via
      // implement(nodeControl).router(...). Flip this assertion in PR3.
      const router = nodeControl as Record<string, unknown>
      assert.equal('getBalance' in router, false)
    })
  })
})
