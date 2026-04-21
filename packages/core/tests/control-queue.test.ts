import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { NodeEvent } from '@moneydevkit/api-contract'

import { CmdQueue, EventQueue } from '../src/control/queue'

test('CmdQueue is FIFO and reports size', () => {
  const q = new CmdQueue()
  assert.equal(q.size, 0)

  const noop = () => {}
  q.push({ kind: 'payout', destination: 'lnurl1', amountMsat: 1, resolve: noop, reject: noop })
  q.push({ kind: 'payout', destination: 'lnurl1', amountMsat: 2, resolve: noop, reject: noop })
  assert.equal(q.size, 2)

  const first = q.shift()
  assert.equal(first?.kind, 'payout')
  assert.equal(first?.kind === 'payout' ? first.amountMsat : -1, 1)
  assert.equal(q.size, 1)

  const second = q.shift()
  assert.equal(second?.kind === 'payout' ? second.amountMsat : -1, 2)
  assert.equal(q.size, 0)

  assert.equal(q.shift(), undefined)
})

test('EventQueue rejects double subscribe', () => {
  const q = new EventQueue()
  q.subscribe()
  assert.throws(() => q.subscribe(), /already subscribed/)
})

test('EventQueue delivers events pushed BEFORE subscribe (start-buffered)', async () => {
  const q = new EventQueue()
  q.push({ type: 'ready', nodeId: 'node-1' })
  q.push({ type: 'paymentSent', paymentId: 'p1', paymentHash: 'h1', preimage: 'pi1' })

  const iter = q.subscribe()[Symbol.asyncIterator]()
  const first = await iter.next()
  assert.deepEqual(first, { value: { type: 'ready', nodeId: 'node-1' }, done: false })
  const second = await iter.next()
  assert.equal(second.done, false)
  assert.equal((second.value as NodeEvent).type, 'paymentSent')
})

test('EventQueue delivers events pushed AFTER subscribe (live delivery)', async () => {
  const q = new EventQueue()
  const iter = q.subscribe()[Symbol.asyncIterator]()
  const pending = iter.next()
  // push after subscriber is awaiting
  q.push({ type: 'ready', nodeId: 'node-2' })
  const result = await pending
  assert.equal(result.done, false)
  assert.deepEqual(result.value, { type: 'ready', nodeId: 'node-2' })
})

test('EventQueue close() drains buffered events before signalling done', async () => {
  const q = new EventQueue()
  q.push({ type: 'leaseReleased' })

  const iter = q.subscribe()[Symbol.asyncIterator]()

  // Close concurrently with consumption. The buffered event must arrive
  // before done. This is the leaseReleased observability guarantee.
  const closing = q.close(500)
  const first = await iter.next()
  assert.equal(first.done, false)
  assert.equal((first.value as NodeEvent).type, 'leaseReleased')

  const second = await iter.next()
  assert.equal(second.done, true)
  await closing
  assert.equal(q.closed, true)
})

test('EventQueue close() is idempotent (no re-flush, no throw)', async () => {
  const q = new EventQueue()
  q.subscribe()
  const p1 = q.close(50)
  const p2 = q.close(50)
  assert.equal(p1, p2, 'second close call returns the same in-flight promise')
  await p1
  // a third call after close should also be a no-op and return immediately
  await q.close(50)
  assert.equal(q.closed, true)
})

test('EventQueue ignores push after close', async () => {
  const q = new EventQueue()
  const iter = q.subscribe()[Symbol.asyncIterator]()
  await q.close(50)
  q.push({ type: 'ready', nodeId: 'late' })
  const r = await iter.next()
  assert.equal(r.done, true)
})

test('EventQueue subscriber waiting when close fires gets done', async () => {
  const q = new EventQueue()
  const iter = q.subscribe()[Symbol.asyncIterator]()
  const pending = iter.next()
  await q.close(50)
  const r = await pending
  assert.equal(r.done, true)
})
