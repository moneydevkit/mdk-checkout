import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

import { PaymentStore, type StoredPayment } from '../src/payment-store'

let tmpDir: string
let store: PaymentStore

function makePayment(overrides: Partial<StoredPayment> = {}): StoredPayment {
  return {
    paymentId: 'abc123',
    paymentHash: 'deadbeef',
    amountSats: 100,
    direction: 'outbound',
    timestamp: Date.now(),
    status: 'pending',
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payment-store-test-'))
  store = new PaymentStore(path.join(tmpDir, 'payments.json'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('PaymentStore.load', () => {
  it('returns empty array when file does not exist', () => {
    assert.deepEqual(store.load(), [])
  })

  it('returns empty array on corrupted JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'payments.json'), 'not json')
    assert.deepEqual(store.load(), [])
  })

  it('backfills missing status as completed', () => {
    const legacy = { paymentHash: 'aabb', amountSats: 50, direction: 'inbound', timestamp: 1 }
    fs.writeFileSync(path.join(tmpDir, 'payments.json'), JSON.stringify([legacy]))

    const payments = store.load()
    assert.equal(payments.length, 1)
    assert.equal(payments[0].status, 'completed')
  })

  it('preserves existing status', () => {
    const payment = makePayment({ status: 'failed' })
    fs.writeFileSync(path.join(tmpDir, 'payments.json'), JSON.stringify([payment]))

    const payments = store.load()
    assert.equal(payments[0].status, 'failed')
  })
})

describe('PaymentStore.save', () => {
  it('creates the file and parent directory', () => {
    const nested = new PaymentStore(path.join(tmpDir, 'sub', 'dir', 'payments.json'))
    nested.save(makePayment())

    const payments = nested.load()
    assert.equal(payments.length, 1)
    assert.equal(payments[0].paymentId, 'abc123')
  })

  it('appends to existing payments', () => {
    store.save(makePayment({ paymentId: 'first' }))
    store.save(makePayment({ paymentId: 'second' }))

    const payments = store.load()
    assert.equal(payments.length, 2)
    assert.equal(payments[0].paymentId, 'first')
    assert.equal(payments[1].paymentId, 'second')
  })
})

describe('PaymentStore.update', () => {
  it('returns false when payment not found', () => {
    store.save(makePayment({ paymentId: 'aaa' }))
    assert.equal(store.update('nonexistent', { status: 'completed' }), false)
  })

  it('updates status and preimage', () => {
    store.save(makePayment({ paymentId: 'target', status: 'pending' }))

    const updated = store.update('target', { status: 'completed', preimage: 'cafebabe' })
    assert.equal(updated, true)

    const payment = store.find('target')!
    assert.equal(payment.status, 'completed')
    assert.equal(payment.preimage, 'cafebabe')
  })

  it('updates paymentHash without touching other fields', () => {
    store.save(makePayment({ paymentId: 'target', paymentHash: null, destination: 'lno1...' }))

    store.update('target', { paymentHash: 'newHash' })

    const payment = store.find('target')!
    assert.equal(payment.paymentHash, 'newHash')
    assert.equal(payment.destination, 'lno1...')
  })

  it('does not modify other payments', () => {
    store.save(makePayment({ paymentId: 'keep', status: 'pending' }))
    store.save(makePayment({ paymentId: 'change', status: 'pending' }))

    store.update('change', { status: 'failed' })

    assert.equal(store.find('keep')!.status, 'pending')
    assert.equal(store.find('change')!.status, 'failed')
  })
})

describe('PaymentStore.find', () => {
  it('returns undefined when not found', () => {
    assert.equal(store.find('missing'), undefined)
  })

  it('returns the matching payment', () => {
    store.save(makePayment({ paymentId: 'needle', amountSats: 999 }))
    store.save(makePayment({ paymentId: 'other', amountSats: 1 }))

    const result = store.find('needle')!
    assert.equal(result.amountSats, 999)
  })
})
