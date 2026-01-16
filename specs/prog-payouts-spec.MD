# Plan: Programmatic Payouts for MDK

## Problem Statement

Users of the MDK nextjs/replit packages need to programmatically pay out from their Lightning wallet. This must be **secure by default** to protect against:

1. **Attackers** - Someone exploiting insecure vibecoded implementations to drain wallets
2. **Accidental self-harm** - Bugs in user code that trigger infinite/unintended payments
3. **Input injection** - User-controlled data passed directly to payment destinations

## Target Use Cases

1. **Gambling/gaming with instant payouts** - Roulette where visitors bet and winners get paid on the spot
2. **Multiplayer betting games** - Sudoku where players bet, winner takes the pool
3. **Vibecoded websites** - Any site that needs automatic payouts based on user actions
4. **Agent-to-agent payments** - AI agents paying for tool/API usage on Replit

### Critical Security Insight

In these use cases:
- **Destination comes from the user** (winner provides their Lightning address)
- **Payouts are triggered by game outcomes**, not admin actions
- **Real-time, low-friction** - Can't require manual approval for each win
- **Dynamic amounts** - Payout depends on pool size, game rules

This means **destination allowlisting doesn't work** - we don't know who will win ahead of time.

## Recommendation: Separate `@moneydevkit/payouts` Package

Create a new package rather than adding to `core/nextjs/replit` because:

- **Explicit opt-in** - Users must consciously install and configure payouts
- **Separate credentials** - Different secret from checkout, limiting blast radius
- **No accidental exposure** - Checkout routes can't trigger payouts
- **Clear security boundary** - Easier to audit, document, and reason about
- **Different threat model** - Outbound payments need stricter controls than inbound

## Security Architecture

### Core Principle: Capped Payouts

Strict spending limits enforced at infrastructure level:

```
Per-payment limit: 1k sats (default, max 100k hardcoded ceiling)
Daily limit: 10k sats (default, max 1M hardcoded ceiling)
Rate limit: 10/minute
```

**Critical implementation requirements:**

1. **Atomic limit checks** - All limit checks (rate, per-payment, daily) must be atomic. Use compare-and-swap or transactions. Never check-then-decrement separately, or concurrent requests bypass limits.

2. **Rolling 24h window** - Daily limit uses rolling window, not midnight reset. Prevents "wait for reset" attacks.

3. **Invoice amount validation** - Before paying, validate resolved invoice amount matches requested amount. Reject if invoice asks for more.

4. **Hardcoded ceilings** - Even if env vars are manipulated, absolute maximums can't be exceeded:
   - Per-payment: 100k sats max (can't be raised via env)
   - Daily: 1M sats max (can't be raised via env)

5. **No HTTP handler export** - Only export `payout()` function for direct server-side use. Don't provide `createPayoutHandler()` - this prevents SSRF via user-created proxy endpoints.

### Layer 0: Server-Only Enforcement (Prevents Browser Console Attacks)

The package must be **impossible to use from the browser**:

1. **No client exports** - Package only exports server-side code, no React components
2. **Runtime check** - Throws immediately if `typeof window !== 'undefined'`
3. **No NEXT_PUBLIC_ prefix** - `MDK_PAYOUT_SECRET` is never exposed to client bundle
4. **Request validation** - Reject requests with browser indicators:
   - Has `Origin` header from different host (browser CORS)
   - Has `Sec-Fetch-Mode: cors` or `navigate` (browser fetch)
   - Missing server-side auth header

```typescript
// This MUST fail if called from browser
import { payout } from '@moneydevkit/payouts'  // throws: "Cannot use payouts in browser"
```

**Why this matters:** A vibecoder might accidentally expose payout logic in a way that's callable from browser. By making the package server-only at runtime, even bad code can't be exploited from console.

### Layer 1: Separate Authentication

```
MDK_ACCESS_TOKEN     → Checkout operations (receiving payments)
MDK_PAYOUT_SECRET    → Payout operations (sending payments) - NEW
MDK_MNEMONIC         → Wallet access (shared, server-side only)
```

- `MDK_PAYOUT_SECRET` must be different from `MDK_ACCESS_TOKEN`
- Validation at startup: refuse to start if secrets are identical
- Longer, higher-entropy secret requirement (min 32 chars)
- If secret starts with `NEXT_PUBLIC_`, refuse to start (common mistake)

### Layer 2: Spending Limits (Enforced Server-Side)

```typescript
// Environment variables with sensible defaults
MDK_PAYOUT_MAX_SINGLE=10000        // Max sats per payment (default: 10k sats)
MDK_PAYOUT_MAX_DAILY=100000        // Max sats per 24h rolling window (default: 100k sats)
MDK_PAYOUT_MAX_HOURLY=50000        // Max sats per hour (default: 50k sats)
```

- Limits tracked on moneydevkit.com - checked server-side before each payout
- Limits enforced **before** payment attempt, not just documented
- Same limits on signet and mainnet - override via env vars if needed
- Requires explicit override to increase (environment variable)

### Layer 3: Destination Allowlist (Optional)

```typescript
// Environment variable: comma-separated BOLT12 offers, node pubkeys, or domains
MDK_PAYOUT_ALLOWED_DESTINATIONS=offer1...,03abcd...,*.wallet.com
```

- If set, payments to unlisted destinations are rejected
- LNURL domain validation prevents open redirect attacks
- BOLT11 validated against node pubkey if nodeId allowlist is set

### Layer 4: Rate Limiting (Built-In)

```typescript
// Defaults, configurable via env
MDK_PAYOUT_RATE_LIMIT=10           // Max payments per minute (default: 10)
MDK_PAYOUT_RATE_LIMIT_WINDOW=60000 // Window in ms (default: 60s)
```

- Sliding window rate limiter
- Throws `RateLimitError` with retry-after when exceeded
- Prevents runaway loops from draining wallet

### Layer 5: Idempotency Keys (Required)

```typescript
// User MUST provide an idempotency key
await payout.send({
  destination: 'lno1...',
  amountSats: 1000,
  idempotencyKey: 'order-123-payout', // Required, user-provided
})
```

- Same key within 24h returns previous result (success or failure)
- Prevents duplicate payments from retries or bugs
- Keys stored in VSS, expire after 24h

### Layer 6: Confirmation Callback (Optional)

```typescript
const result = await payout({
  destination: 'user@wallet.com',
  amountSats: 1000,
  idempotencyKey: 'order-123',

  // Called BEFORE payment is sent - return false to abort
  beforePayout: async (payment) => {
    return await checkApprovalSystem(payment)
  },
  // Called AFTER payment completes
  afterPayout: async (result) => {
    await logToDatabase(result)
  }
})
```

- Allows users to add approval workflows inline
- Async, so can call external systems
- Timeout on beforePayout prevents hanging

## API Design

### Package: `@moneydevkit/payouts`

```typescript
// packages/payouts/src/index.ts - Server-only exports
export { payout } from './payout'
export { getBalance } from './balance'
export { paidFetch } from './paid-fetch'           // For agent mode
export { createPaidEndpoint } from './paid-endpoint' // For tool providers
export type { PayoutOptions, PayoutResult, Balance } from './types'

// NO createPayoutHandler - prevents SSRF via proxy endpoints
```

### Basic Usage

```typescript
import { payout, getBalance } from '@moneydevkit/payouts'

// Check balance
const balance = await getBalance()
// { sats: 50000, btc: 0.0005, usd: 25.00, eur: 23.00 }

// Payout in sats
const result = await payout({
  destination: 'winner@wallet.com',
  amount: 1000,
  currency: 'sats',                  // 'sats' | 'btc' | 'usd' | 'eur' | etc.
  idempotencyKey: 'game-123-win',
})

// Payout in USD - moneydevkit.com returns sats equivalent
const result = await payout({
  destination: 'winner@wallet.com',
  amount: 5.00,
  currency: 'usd',                   // Converted to sats by moneydevkit.com
  idempotencyKey: 'game-456-win',
})
// result.amountSats = 10000 (actual sats paid based on current rate)

if (result.success) {
  console.log('Paid:', result.paymentId, result.amountSats)
} else {
  console.error('Failed:', result.error)  // Structured error with code, no sensitive info
}
```

**Currency conversion:** moneydevkit.com provides BTC price. Amount converted to sats before payment.

**Balance check:** Before each payout, balance is checked. If insufficient, returns `InsufficientBalanceError` with current balance and required amount.

**Security:** Per-payment limit (1k sats), daily limit (10k sats), rate limited, idempotency required, server-only, browser-rejected. Errors include codes but no sensitive info.

### L402 / Agent Payments

**Tool provider (accepting payments - this is RECEIVING, not sending):**
```typescript
import { createPaidEndpoint } from '@moneydevkit/payouts'

// This is an HTTP handler, but it RECEIVES payments (like checkout)
// It does NOT call payout() - it generates invoices and waits for payment
export const POST = createPaidEndpoint({
  priceSats: 10,
  handler: async (req, { payment }) => {
    return Response.json(await doWork(req.body))
  },
})
```

**Agent (paying for APIs):**
```typescript
import { paidFetch } from '@moneydevkit/payouts'

// Handles 402 flow: get invoice -> pay -> retry with preimage
const response = await paidFetch('https://tool.replit.app/api/work', {
  method: 'POST',
  body: data,
  payment: { maxSats: 100 },  // Refuse to pay more
})
```

**Security:** `maxSats` caps per-request. Per-domain hourly limits.

**Protocol:** Simple invoice-in-header (not full L402 with macaroons). Add macaroons later if needed.

### Supported Destinations

```typescript
type PayoutDestination =
  | string // Auto-detect: BOLT11, BOLT12, LNURL, Lightning Address
  | { type: 'bolt11', invoice: string }
  | { type: 'bolt12', offer: string }
  | { type: 'lnurl', url: string }
  | { type: 'lightningAddress', address: string }
```

## Attack Scenarios & Mitigations

### Scenario 0: Browser console attack
```javascript
fetch('/api/payout', { method: 'POST', body: JSON.stringify({ to: 'attacker@wallet' }) })
```
**Mitigation:** Handler rejects requests with browser headers (`Sec-Fetch-Mode`, cross-origin `Origin`). Package throws if imported in browser.

### Scenario 1: Exposed endpoint without auth
```typescript
app.post('/payout', (req, res) => {
  await payout({ destination: req.body.address, amountSats: 1000 })
})
```
**Mitigation:** 1k/payment, 10k/day limits. Rate limiting. Worst case: 10k sats/day.

### Scenario 2: Infinite loop
```typescript
while (true) {
  await payout({ destination: winner, amountSats: 100, idempotencyKey: 'same-key' })
}
```
**Mitigation:** Same idempotency key = same result (no duplicate payment). Rate limiter kicks in. Daily limit caps total.

### Scenario 3: Logic error pays 10x
```typescript
await payout({ amountSats: winnings * 10 })  // Typo: 10000 instead of 1000
```
**Mitigation:** Per-payment limit (1k default) rejects. Payment fails, no money sent.

### Scenario 4: Malicious LNURL
```typescript
await payout({ destination: 'lnurl1...evil', amountSats: 1000 })
```
**Mitigation:** Amount specified by caller. If resolved invoice requests more, payment fails.

### Scenario 5: Agent overcharged
```typescript
await paidFetch('https://evil.com/api', { payment: { maxSats: 100 } })
// Tool returns invoice for 10000 sats
```
**Mitigation:** `maxSats` enforced. Invoice for 10000 sats rejected.

### Scenario 6: Agent infinite loop
```typescript
while (true) {
  await paidFetch('https://tool.com/api', { payment: { maxSats: 10 } })
}
```
**Mitigation:** Per-domain + global hourly limits. Requests fail after limit hit.

### Scenario 7: Concurrent request flood
```typescript
// 100 simultaneous requests
Promise.all(Array(100).fill().map((_, i) =>
  payout({ destination: addr, amountSats: 1000, idempotencyKey: `key-${i}` })
))
```
**Mitigation:** Atomic limit checks. All 100 requests race for the same daily limit counter. First 10 succeed (10k daily), rest rejected.

### Scenario 8: Invoice amount mismatch
```typescript
// User's Lightning address returns invoice for 100k sats
await payout({ destination: 'scammer@evil.com', amountSats: 1000 })
```
**Mitigation:** Validate resolved invoice amount matches requested amount. Invoice for 100k when we asked for 1k = rejected before payment.

### Scenario 9: SSRF via proxy (payout)
```typescript
// Vibecoder wrote a proxy endpoint
app.post('/proxy', async (req, res) => {
  const response = await fetch(req.body.url, req.body.options)
  res.json(await response.json())
})
// Attacker uses it to call payout internally, bypassing browser detection
```
**Mitigation:** No HTTP handler exported. `payout()` must be called directly in code, can't be triggered via HTTP. Limits still cap damage if user writes unsafe endpoint.

### Scenario 11: SSRF via paidFetch
```typescript
// Vibecoder wrote a tool-calling proxy
app.post('/call-tool', async (req, res) => {
  const result = await paidFetch(req.body.url, { payment: { maxSats: 100 } })
  res.json(await result.json())
})
// Attacker makes server pay arbitrary URLs
```
**Mitigation:** Per-domain hourly limits. `maxSats` caps each payment. Daily limit caps total. Attacker can't drain wallet, just make server pay for random tools within limits.

### Scenario 10: Env var manipulation
```typescript
// Attacker gains env write access, sets:
// MDK_PAYOUT_MAX_SINGLE=1000000
```
**Mitigation:** Hardcoded ceilings (100k/payment, 1M/day) can't be exceeded regardless of env vars. Attacker can raise to ceiling but not beyond.

## Configuration Summary

```bash
# Required
MDK_PAYOUT_SECRET=your-secure-payout-secret-min-32-chars

# Recommended
MDK_PAYOUT_MAX_SINGLE=10000      # 10k sats max per payment
MDK_PAYOUT_MAX_DAILY=100000      # 100k sats max per day
MDK_PAYOUT_ALLOWED_DESTINATIONS=lno1...,03abc...

# Optional
MDK_PAYOUT_MAX_HOURLY=50000      # 50k sats max per hour
MDK_PAYOUT_RATE_LIMIT=10         # 10 payments per minute max
```