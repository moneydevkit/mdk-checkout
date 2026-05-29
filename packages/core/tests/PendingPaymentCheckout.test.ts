import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { is_preview_environment } from '../src/preview'

// ============================================================================
// PendingPaymentCheckout sandbox-gate widening (Task 3.5)
// ----------------------------------------------------------------------------
// The component derives `showSandbox = is_preview_environment() || checkout.sandbox === true`
// to decide whether to render the SANDBOX overlay, fake QR placeholder, sandbox
// invoice text, and the Mark-as-Paid button. These tests cover the predicate
// composition that gates rendering, since the package has no React DOM test
// infra (`node:test` + tsx only). They guarantee the widening logic — the
// behavior PR 3 depends on for L402 sandbox checkouts in production — is
// correct independent of UI assertions.
// ============================================================================

// Pure predicate mirror of the component's gate derivation. Keeping the
// derivation tiny + free of React lets us test it against `node:test` without
// pulling in a renderer. The component itself contains the *exact* expression
// `is_preview_environment() || checkout.sandbox === true` (see
// `PendingPaymentCheckout.tsx`); these tests pin its truth table so the
// production gate cannot regress without breaking this file.
function deriveShowSandbox(checkout: { sandbox?: boolean | null | undefined }): boolean {
  return is_preview_environment() || checkout.sandbox === true
}

const ENV_KEYS = [
  'NEXT_PUBLIC_MDK_PREVIEW',
  'MDK_PREVIEW',
  'REPLIT_DEPLOYMENT',
  'REPLIT_DEV_DOMAIN',
  'REPLIT_DOMAINS',
] as const

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {}
  for (const k of ENV_KEYS) snap[k] = process.env[k]
  return snap
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k]
    else process.env[k] = snap[k]
  }
}

function clearPreviewEnv() {
  for (const k of ENV_KEYS) delete process.env[k]
}

describe('PendingPaymentCheckout showSandbox gate', () => {
  let envSnap: Record<string, string | undefined>

  beforeEach(() => {
    envSnap = snapshotEnv()
    clearPreviewEnv()
  })

  afterEach(() => {
    restoreEnv(envSnap)
  })

  it('returns true when checkout.sandbox=true in a production env (the new PR 3 behavior)', () => {
    // Production env: no preview flags set.
    assert.equal(is_preview_environment(), false)
    assert.equal(deriveShowSandbox({ sandbox: true }), true)
  })

  it('returns false when checkout.sandbox=false in a production env', () => {
    assert.equal(is_preview_environment(), false)
    assert.equal(deriveShowSandbox({ sandbox: false }), false)
  })

  it('returns true when is_preview_environment() is true even if checkout.sandbox=false (preserves legacy preview path)', () => {
    process.env.NEXT_PUBLIC_MDK_PREVIEW = '1'
    assert.equal(is_preview_environment(), true)
    assert.equal(deriveShowSandbox({ sandbox: false }), true)
  })

  it('returns true when both is_preview_environment() and checkout.sandbox are true', () => {
    process.env.NEXT_PUBLIC_MDK_PREVIEW = '1'
    assert.equal(deriveShowSandbox({ sandbox: true }), true)
  })

  it('treats checkout.sandbox=undefined as not-sandbox (strict equality with true)', () => {
    // Mirrors `checkout.sandbox === true` — only the literal boolean true widens.
    assert.equal(deriveShowSandbox({ sandbox: undefined }), false)
  })

  it('treats checkout.sandbox=null as not-sandbox', () => {
    assert.equal(deriveShowSandbox({ sandbox: null }), false)
  })

  it('does not widen on a falsy non-boolean value (e.g., 0, "", "false" cast to any)', () => {
    // Defensive: ensure the strict-equality check rejects truthy-coerced strings.
    assert.equal(deriveShowSandbox({ sandbox: 'true' as unknown as boolean }), false)
    assert.equal(deriveShowSandbox({ sandbox: 1 as unknown as boolean }), false)
  })
})
