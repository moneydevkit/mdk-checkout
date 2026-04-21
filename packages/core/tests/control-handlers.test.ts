import assert from 'node:assert/strict'
import { test } from 'node:test'

import { call } from '@orpc/server'

import type { ControlContext } from '../src/control/handlers'
import { nodeControlRouter } from '../src/control/handlers'
import { CmdQueue, EventQueue } from '../src/control/queue'

function makeContext(overrides: Partial<ControlContext> = {}): ControlContext {
  return {
    queue: new CmdQueue(),
    eventQueue: new EventQueue(),
    sessionState: { nodeReady: true, draining: false },
    env: { WITHDRAWAL_DESTINATION: 'lnurl1example' },
    ...overrides,
  }
}

test('payout rejects when nodeReady is false', async () => {
  const ctx = makeContext({ sessionState: { nodeReady: false, draining: false } })
  await assert.rejects(
    call(nodeControlRouter.payout, { amountMsat: 1000, idempotencyKey: 'k1' }, { context: ctx }),
    /node has not finished/,
  )
  assert.equal(ctx.queue.size, 0, 'no command should be enqueued')
})

test('payout rejects when draining', async () => {
  const ctx = makeContext({ sessionState: { nodeReady: true, draining: true } })
  await assert.rejects(
    call(nodeControlRouter.payout, { amountMsat: 1000, idempotencyKey: 'k1' }, { context: ctx }),
    /drain window/,
  )
  assert.equal(ctx.queue.size, 0)
})

test('payout rejects when WITHDRAWAL_DESTINATION is unset', async () => {
  const ctx = makeContext({ env: { WITHDRAWAL_DESTINATION: undefined } })
  await assert.rejects(
    call(nodeControlRouter.payout, { amountMsat: 1000, idempotencyKey: 'k1' }, { context: ctx }),
    /WITHDRAWAL_DESTINATION/,
  )
})

test('payout enqueues with env-derived destination (NOT from input)', async () => {
  const ctx = makeContext({ env: { WITHDRAWAL_DESTINATION: 'lnurl-pre-configured' } })
  const pending = call(
    nodeControlRouter.payout,
    { amountMsat: 12345, idempotencyKey: 'k1' },
    { context: ctx },
  )
  // Loop side: pull the queued cmd and resolve it
  await new Promise((r) => setImmediate(r))
  const cmd = ctx.queue.shift()
  assert.ok(cmd)
  assert.equal(cmd?.kind, 'payout')
  if (cmd?.kind === 'payout') {
    assert.equal(cmd.destination, 'lnurl-pre-configured', 'destination from env, not input')
    assert.equal(cmd.amountMsat, 12345, 'msats round-trip with no 1000x conversion')
    cmd.resolve({ accepted: true, paymentId: 'pay-id-1', paymentHash: 'hash-1' })
  }
  const result = await pending
  assert.deepEqual(result, { accepted: true, paymentId: 'pay-id-1', paymentHash: 'hash-1' })
})

test('createBolt11 enqueues amountMsat with no unit conversion', async () => {
  const ctx = makeContext()
  const pending = call(
    nodeControlRouter.invoice.createBolt11,
    { amountMsat: 50_000, description: 'test', expirySecs: 600, idempotencyKey: 'k2' },
    { context: ctx },
  )
  await new Promise((r) => setImmediate(r))
  const cmd = ctx.queue.shift()
  assert.equal(cmd?.kind, 'createBolt11')
  if (cmd?.kind === 'createBolt11') {
    assert.equal(cmd.amountMsat, 50_000)
    assert.equal(cmd.description, 'test')
    assert.equal(cmd.expirySecs, 600)
    cmd.resolve({ bolt11: 'lnbc...', paymentHash: 'h', expiresAt: 1234, scid: 'scid' })
  }
  const r = await pending
  assert.equal(r.bolt11, 'lnbc...')
})

test('createBolt11 with amountMsat=null is variable-amount', async () => {
  const ctx = makeContext()
  const pending = call(
    nodeControlRouter.invoice.createBolt11,
    { amountMsat: null, description: 'var', expirySecs: 300, idempotencyKey: 'k3' },
    { context: ctx },
  )
  await new Promise((r) => setImmediate(r))
  const cmd = ctx.queue.shift()
  assert.equal(cmd?.kind, 'createBolt11')
  if (cmd?.kind === 'createBolt11') {
    assert.equal(cmd.amountMsat, null)
    cmd.resolve({ bolt11: 'lnbc-var', paymentHash: 'h', expiresAt: 1, scid: 's' })
  }
  await pending
})

test('createBolt12Offer enqueues correctly', async () => {
  const ctx = makeContext()
  const pending = call(
    nodeControlRouter.invoice.createBolt12Offer,
    { amountMsat: 99_000, description: 'offer', expirySecs: 60, idempotencyKey: 'k4' },
    { context: ctx },
  )
  await new Promise((r) => setImmediate(r))
  const cmd = ctx.queue.shift()
  assert.equal(cmd?.kind, 'createBolt12Offer')
  if (cmd?.kind === 'createBolt12Offer') {
    assert.equal(cmd.amountMsat, 99_000)
    cmd.resolve({ offer: 'lno...' })
  }
  const r = await pending
  assert.equal(r.offer, 'lno...')
})

test('events() yields buffered events even when subscribed late', async () => {
  const ctx = makeContext()
  ctx.eventQueue.push({ type: 'ready', nodeId: 'n1' })
  ctx.eventQueue.push({ type: 'paymentSent', paymentId: 'p1', paymentHash: 'h1', preimage: 'pi' })

  const iter = await call(nodeControlRouter.events, undefined as unknown as void, { context: ctx })
  const it = iter[Symbol.asyncIterator]()
  const first = await it.next()
  assert.equal(first.done, false)
  assert.deepEqual(first.value, { type: 'ready', nodeId: 'n1' })
  const second = await it.next()
  assert.equal(second.done, false)
  if (second.value && typeof second.value === 'object' && 'type' in second.value) {
    assert.equal((second.value as { type: string }).type, 'paymentSent')
  }
})

test('payout reject resolves the RPC with an error from the loop', async () => {
  const ctx = makeContext()
  const pending = call(
    nodeControlRouter.payout,
    { amountMsat: 100, idempotencyKey: 'fail' },
    { context: ctx },
  )
  await new Promise((r) => setImmediate(r))
  const cmd = ctx.queue.shift()
  assert.ok(cmd)
  cmd?.reject(new Error('payNow blew up'))
  await assert.rejects(pending, /payNow blew up/)
})
