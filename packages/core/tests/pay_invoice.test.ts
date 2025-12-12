import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import { handlePreviewPayInvoice } from '../src/handlers/pay_invoice'

const originalEnv = { ...process.env }

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/mdk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  process.env = { ...originalEnv }
})

beforeEach(() => {
  delete process.env.REPL_ID
  delete process.env.REPL_OWNER
  delete process.env.REPLIT_CLUSTER
  delete process.env.REPLIT_DEPLOYMENT
  delete process.env.REPLIT_CONTEXT
  delete process.env.REPL_SLUG
})

test('pay_invoice rejects when not in preview', async () => {
  const res = await handlePreviewPayInvoice(
    makeRequest({ paymentHash: 'hash', amountSats: 1 }),
  )
  assert.equal(res.status, 403)
})

test('pay_invoice with wrong payload is rejected before processing', async () => {
  process.env.REPL_ID = 'preview-repl'

  const req = new Request('http://localhost/api/mdk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ paymentHash: '', amountSats: -1 }),
  })

  const res = await handlePreviewPayInvoice(req)
  assert.equal(res.status, 400)
})
