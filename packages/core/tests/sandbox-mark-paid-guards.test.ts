import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import { markInvoicePaidPreview } from '../src/actions'
import { clientPayInvoice } from '../src/client-actions'

const originalEnv = { ...process.env }

function clearPreviewEnv() {
  delete process.env.REPLIT_DEV_DOMAIN
  delete process.env.REPLIT_DEPLOYMENT
  delete process.env.REPLIT_DOMAINS
  delete process.env.MDK_PREVIEW
  delete process.env.NEXT_PUBLIC_MDK_PREVIEW
}

afterEach(() => {
  process.env = { ...originalEnv }
})

beforeEach(() => {
  clearPreviewEnv()
})

// The merchant-asserted `paymentReceived` RPC is reachable through several
// preview-mode convenience helpers. These guards keep those helpers off real
// production deployments — refusing to mint the request in the first place
// prevents a same-origin CSRF-valid caller from fake-marking pending invoices.
// Server-side enforcement (moneydevkit.com payment-received.ts) is the second
// layer; these tests pin the first.

test('markInvoicePaidPreview throws outside a preview environment', async () => {
  await assert.rejects(
    () => markInvoicePaidPreview('hash', 1),
    /preview environment/i,
  )
})

test('markInvoicePaidPreview passes the preview gate when REPLIT_DEV_DOMAIN is set', async () => {
  process.env.REPLIT_DEV_DOMAIN = 'preview-repl.repl.co'
  // We don't fully exercise the network call; the contract this test pins is
  // that the preview guard itself doesn't reject. Any failure here MUST not
  // mention "preview environment".
  await assert.rejects(
    () => markInvoicePaidPreview('hash', 1),
    (err: unknown) => {
      assert.ok(err instanceof Error)
      assert.doesNotMatch(err.message, /preview environment/i)
      return true
    },
  )
})

test('clientPayInvoice throws outside a preview environment', async () => {
  await assert.rejects(
    () => clientPayInvoice('hash', 1),
    /preview environment/i,
  )
})

test('clientPayInvoice passes the preview gate when REPLIT_DEV_DOMAIN is set', async () => {
  process.env.REPLIT_DEV_DOMAIN = 'preview-repl.repl.co'
  await assert.rejects(
    () => clientPayInvoice('hash', 1),
    (err: unknown) => {
      assert.ok(err instanceof Error)
      assert.doesNotMatch(err.message, /preview environment/i)
      return true
    },
  )
})
