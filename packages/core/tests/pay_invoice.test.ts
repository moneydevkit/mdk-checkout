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
  delete process.env.REPLIT_DEV_DOMAIN
  delete process.env.REPLIT_DEPLOYMENT
  delete process.env.REPLIT_DOMAINS
  delete process.env.MDK_PREVIEW
  delete process.env.NEXT_PUBLIC_MDK_PREVIEW
})

// `markInvoicePaidPreview → paymentReceived` is merchant-asserted and lets the
// caller fake-mark any pending invoice as paid (firing checkout.completed and,
// without a server-side cross-check on every sandbox flavor, potentially
// triggering autopayout). The preview-only gate caps blast radius to dev
// runtimes. Server-side defense-in-depth lives in moneydevkit.com's
// payment-received.ts (sandbox=true requires App.mode='sandbox').
test('pay_invoice returns 403 outside preview environment', async () => {
  const res = await handlePreviewPayInvoice(
    makeRequest({ paymentHash: 'hash', amountSats: 1 }),
  )
  assert.equal(res.status, 403)
})

test('pay_invoice passes the preview gate when REPLIT_DEV_DOMAIN is set', async () => {
  process.env.REPLIT_DEV_DOMAIN = 'preview-repl.repl.co'

  const res = await handlePreviewPayInvoice(
    makeRequest({ paymentHash: 'hash', amountSats: 1 }),
  )
  // Past the preview gate. The call eventually fails downstream (no real mdk
  // client wired up in this unit test), but the assertion that matters here
  // is that we did not get a 403.
  assert.notEqual(res.status, 403)
})

test('pay_invoice with wrong payload is rejected before processing', async () => {
  process.env.REPLIT_DEV_DOMAIN = 'preview-repl.repl.co'

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
