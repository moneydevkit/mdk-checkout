# @moneydevkit/nextjs

moneydevkit checkout library for embedding Lightning-powered payments inside Next.js (App Router) apps.

## Setup
1. **Create a Money Dev Kit account** at [moneydevkit.com](https://moneydevkit.com) or run `npx @moneydevkit/create` to generate credentials locally, then grab your `api_key`, `webhook_key`, and mnemonic.
2. **Install the SDK** in your project:
   ```bash
   npm install @moneydevkit/nextjs
   ```
3. **Add required secrets** to `.env` (or similar):
   ```env
   MDK_ACCESS_TOKEN=your_api_key_here
   MDK_MNEMONIC=your_mnemonic_here
   ```

## Quick Start (Next.js App Router)
### 1. Trigger a checkout from any client component
```jsx
// app/page.js
'use client'

import { useCheckout } from '@moneydevkit/nextjs'
import { useState } from 'react'

export default function HomePage() {
  const { createCheckout, isLoading } = useCheckout()
  const [error, setError] = useState(null)

  const handlePurchase = async () => {
    setError(null)

    const result = await createCheckout({
      type: 'AMOUNT',      // or 'PRODUCTS' for product-based checkouts
      title: 'Describe the purchase shown to the buyer',
      description: 'A description of the purchase',
      amount: 500,         // 500 USD cents or Bitcoin sats
      currency: 'USD',     // or 'SAT'
      successUrl: '/checkout/success',
      metadata: {
        customField: 'internal reference for this checkout',
        name: 'John Doe'
      }
    })

    if (result.error) {
      setError(result.error.message)
      return
    }

    window.location.href = result.data.checkoutUrl
  }

  return (
    <div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={handlePurchase} disabled={isLoading}>
        {isLoading ? 'Creating checkout…' : 'Buy Now'}
      </button>
    </div>
  )
}
```

### 2. Render the hosted checkout page
```jsx
// app/checkout/[id]/page.js
"use client";
import { Checkout } from "@moneydevkit/nextjs";
import { use } from "react";

export default function CheckoutPage({ params }) {
  const { id } = use(params);

  return <Checkout id={id} />;
}
```

### 3. Expose the unified Money Dev Kit endpoint
```js
// app/api/mdk/route.js
export { POST } from "@moneydevkit/nextjs/server/route";
```

### 4. Configure Next.js
```js
// next.config.js / next.config.mjs
import withMdkCheckout from '@moneydevkit/nextjs/next-plugin'

export default withMdkCheckout({})
```

You now have a complete Lightning checkout loop: the button creates a session, the dynamic route renders it, and the webhook endpoint signals your Lightning node to claim paid invoices.

## Server-side payouts

Programmatic payouts let your server send sats out to a Lightning destination (BOLT11 invoice, BOLT12 offer, or LNURL / Lightning address) without any user interaction. They must run from a server function (Server Action, route handler, cron, webhook), and the app must have programmatic payouts enabled in the moneydevkit dashboard.

> **Trust:** the destination is whatever your server passes in. There is no end-user confirmation. Always apply your own authorization and business rules first (who is allowed to trigger this, how much, where to).

### Minimal example

```ts
// app/actions.ts
'use server'

import { programmaticPayout } from '@moneydevkit/nextjs/server'

export async function sendTip(orderId: string) {
  const result = await programmaticPayout({
    amountSats: 10_000,
    destination: 'lnbc...',     // or 'satoshi@example.com', or 'lno1...'
    idempotencyKey: orderId,    // pass the SAME value if you ever retry
  })

  if (result.error) {
    // See the next section for how to handle this properly.
    throw new Error(result.error.message)
  }

  return result.data  // { accepted: true, paymentId, paymentHash }
}
```

### About `idempotencyKey`

The key is how moneydevkit dedupes retries. If your code (or a cron, or a Vercel retry) fires the same payout twice with the same key, the second call is a no-op instead of a double-pay.

- **Do** use a stable id from your own database: `orderId`, `withdrawalId`, `userId + payoutDate`, etc.
- **Don't** generate a fresh `crypto.randomUUID()` on every call. That defeats the whole point and you can double-pay.
- It's just a string, any length, your choice.

### Full example with error handling

The `result.error` object tells you whether the failure is worth retrying:

- `result.error.retryable === true` - the failure was transient (limits, transient routing, fee issues). Retry the same call with the same `idempotencyKey`.
- `result.error.retryable === false` - retrying won't help. Fix the input or your config.
- `result.error.retryable === undefined` - the SDK couldn't classify the failure. Treat as not retryable, log and inspect `result.error`.

```ts
// app/actions.ts
'use server'

import { programmaticPayout } from '@moneydevkit/nextjs/server'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function sendPayout(orderId: string, destination: string) {
  let attempt = 0
  while (attempt < 3) {
    const result = await programmaticPayout({
      amountSats: 10_000,
      destination,
      idempotencyKey: orderId,
    })

    if (!result.error) {
      // Note: result.data only confirms the node accepted the payout.
      // The actual Lightning settlement happens asynchronously - listen
      // for paymentSent / paymentFailed webhooks to confirm final outcome.
      return { ok: true as const, paymentId: result.data.paymentId }
    }

    switch (result.error.reason) {
      case 'app_scoped_api_key_required':
        // The API key in MDK_ACCESS_TOKEN is not attached to a specific app.
        // Copy the API key from your app's page in the Apps dashboard.
        return { ok: false as const, fatal: 'use_the_app_api_key_from_dashboard' }

      case 'programmatic_payouts_disabled':
        // Toggle is off in the dashboard for this app.
        return { ok: false as const, fatal: 'enable_programmatic_payouts_in_dashboard' }

      case 'amount_too_large':
        // Per-request cap. Ask the user for a smaller amount or split.
        return { ok: false as const, fatal: 'amount_too_large' }

      case 'amount_invalid':
        // Non-positive or non-integer sat amount.
        return { ok: false as const, fatal: 'amount_invalid' }

      case 'daily_limit_exceeded':
        // 24h rolling cap. Surface to the user; don't retry now.
        return { ok: false as const, fatal: 'come_back_tomorrow' }

      case 'payout_dispatch_failed':
        // Backend dispatch failed (node offline, transient routing, fees).
        // The error message has the specific cause. Safe to retry with the
        // same idempotencyKey.
        await sleep(1_000 * 2 ** attempt)
        attempt++
        continue

      default:
        // Unknown / unclassified. Don't retry blindly.
        return {
          ok: false as const,
          fatal: 'unknown_error',
          message: result.error.message,
          code: result.error.code,
        }
    }
  }

  return { ok: false as const, fatal: 'retries_exhausted' }
}
```

### Common gotchas

- **Don't call from client code.** `programmaticPayout` checks for `window` and refuses to run in a browser. It only works in Server Actions, route handlers (`app/api/...`), cron jobs, or webhook receivers.
- **Set `MDK_ACCESS_TOKEN`.** Same env var as the rest of the SDK. If missing, you get `missing_access_token` (not retryable).
- **Always pass the same `idempotencyKey` on retry.** If you change it, moneydevkit treats it as a new payout and may charge you twice.

### Error reference

`result.error.reason` is a short machine-readable string. Use it for branching; use `result.error.message` for logs.

| `reason`                          | `retryable` | What it means                                                              |
|-----------------------------------|-------------|----------------------------------------------------------------------------|
| `app_scoped_api_key_required`     | false       | The API key in `MDK_ACCESS_TOKEN` isn't tied to a specific app. Copy the key from the app's page in the Apps dashboard |
| `programmatic_payouts_disabled`   | false       | Toggle is off in dashboard for this app                                    |
| `amount_too_large`                | false       | Above per-request cap                                                      |
| `amount_invalid`                  | false       | Backend rejected the amount (non-positive or non-integer sats)             |
| `daily_limit_exceeded`            | true        | 24h rolling cap hit; retry tomorrow                                        |
| `payout_dispatch_failed`          | true        | Backend dispatch failed (node offline, transient routing, fee issues). Inspect `error.message` for the specific cause; safe to retry with the same `idempotencyKey` |
| _(undefined)_                     | _(undefined)_ | New / unknown backend code. Log `error.code` and don't retry blindly     |

Also returned for client-side validation issues (always `retryable: false`):

| `code`                      | When                                                       |
|-----------------------------|------------------------------------------------------------|
| `server_only`               | Called from a browser runtime                              |
| `invalid_amount`            | `amountSats` is not a positive integer                     |
| `invalid_destination`       | Empty, too long, or contains control characters            |
| `invalid_idempotency_key`   | Empty / missing                                            |
| `missing_access_token`      | `MDK_ACCESS_TOKEN` not set                                 |

## Reading the merchant balance from a Server Action

`getBalance()` reads the spendable (outbound) balance of the Lightning node tied to your `MDK_ACCESS_TOKEN`. Same server-only constraints as `programmaticPayout`: the helper refuses to run in a browser and routes through mdk.com over HTTPS, which in turn dials the merchant node over the WS control plane.

```ts
// app/actions.ts
'use server'

import { getBalance } from '@moneydevkit/nextjs/server'

export async function fetchBalance() {
  const result = await getBalance()

  if (result.error) {
    // retryable === true: transient (merchant function spinning up).
    // retryable === false: terminal (invalid key, legacy org-level key, banned, or
    // procedure-not-found from a pre-0.1.30 merchant / older mdk.com).
    throw new Error(result.error.message)
  }

  return result.data.balanceSats // number, in sats
}
```

### Notes

- **App-scoped API key required.** Balance is meaningful per-app, not per-org. Legacy org-level keys return `GET_BALANCE_APP_KEY_REQUIRED` (not retryable). Use the API key from the App page in the dashboard.
- **First call may take a few seconds.** If the merchant function is cold, mdk.com fires a spin-up webhook and waits for the WS to register. Subsequent calls within the function's lifetime are fast.
- **Server-only.** Same `typeof window` check as `programmaticPayout`. Don't call from client components.
- **Idempotent.** Safe to retry. Transient errors are flagged `retryable: true`; auth, app-scope, and procedure-not-found errors are `retryable: false`.

### Error reference

| `code`                            | `retryable` | What it means                                                  |
|-----------------------------------|-------------|----------------------------------------------------------------|
| `server_only`                     | false       | Called from a browser runtime                                  |
| `missing_access_token`            | false       | `MDK_ACCESS_TOKEN` not set                                     |
| `GET_BALANCE_APP_KEY_REQUIRED`    | false       | Using a legacy org-level key. Copy the key from the App page   |
| `UNAUTHORIZED` / `FORBIDDEN`      | false       | Invalid API key or banned user                                 |
| `NOT_FOUND`                       | false       | Procedure missing - pre-0.1.30 merchant SDK or older mdk.com   |
| `BAD_REQUEST`                     | false       | Server rejected the request as malformed                       |
| `GET_BALANCE_SPIN_UP_TIMEOUT`     | true        | Merchant function did not register WS in time. Safe to retry   |
| `get_balance_failed`              | true        | Network / unclassified error                                   |

## Customer Data
Collect and store customer information with each checkout. Pass `customer` to pre-fill data and `requireCustomerData` to prompt the user for specific fields:

```jsx
const result = await createCheckout({
  type: 'AMOUNT',
  title: "Premium Plan",
  description: 'Monthly subscription',
  amount: 1000,
  currency: 'USD',
  successUrl: '/checkout/success',
  // Pre-fill customer data (optional)
  customer: {
    name: 'John Doe',
    email: 'john@example.com',
  },
  // Require fields at checkout (shows form if not provided)
  requireCustomerData: ['name', 'email', 'company'],
})
```

### How it works
- If all `requireCustomerData` fields are already provided in `customer`, the form is skipped
- If some required fields are missing, a form is shown to collect only those fields
- **Email is required** to create a customer record. Without email, customer data is attached to the checkout but no customer record is created
- Field names are flexible: `tax_id`, `tax-id`, `taxId`, or `Tax ID` all normalize to `taxId`
- Custom fields (beyond `name`, `email`, `externalId`) are stored in customer metadata

### Returning customers
Customers are matched by `email` or `externalId`. When a match is found:
- Existing customer data is preserved and not overwritten
- Only missing fields from `requireCustomerData` are requested
- All checkouts and orders are linked to the same customer record

### Using externalId for authenticated users
When your user is already authenticated in your app, pass `externalId` to link checkouts to their account:

```jsx
const result = await createCheckout({
  type: 'AMOUNT',
  title: "Premium Plan",
  description: 'Monthly subscription',
  amount: 1000,
  currency: 'USD',
  successUrl: '/checkout/success',
  customer: {
    externalId: user.id,  // Your app's user ID
    name: user.name,
    email: user.email,
  },
  requireCustomerData: ['name', 'email'],
})
```

When `externalId` is provided:
- The system assumes the user is authenticated
- If the customer already exists (matched by `externalId`), their stored `name` and `email` are used
- Only fields missing from the customer record are requested
- This prevents authenticated users from being asked for data you already have

## Product Checkouts
Sell products defined in your Money Dev Kit dashboard using `type: 'PRODUCTS'`:

```jsx
import { useCheckout, useProducts } from '@moneydevkit/nextjs'

function ProductPage() {
  const { createCheckout, isLoading } = useCheckout()
  const { products } = useProducts()

  const handleBuyProduct = async (productId) => {
    const result = await createCheckout({
      type: 'PRODUCTS',
      product: productId,
      successUrl: '/checkout/success',
    })

    if (result.error) return
    window.location.href = result.data.checkoutUrl
  }

  return (
    <div>
      {products?.map(product => (
        <button key={product.id} onClick={() => handleBuyProduct(product.id)}>
          Buy {product.name} - ${(product.price?.priceAmount ?? 0) / 100}
        </button>
      ))}
    </div>
  )
}
```

### Checkout Types
- **`type: 'AMOUNT'`** - For donations, tips, or custom amounts. Requires `amount` field.
- **`type: 'PRODUCTS'`** - For selling products. Requires `product` field with a product ID. Amount is calculated from product price.

> **Note:** Product prices are returned in base currency units:
> - **USD**: cents (divide by 100 for dollars)
> - **SAT**: satoshis (no conversion needed)

### Pay What You Want (CUSTOM prices)
Products can have CUSTOM prices that let customers choose their own amount. When a checkout includes a product with a CUSTOM price, the checkout UI automatically shows an amount input field:

```jsx
// Create a checkout for a product with CUSTOM pricing
const result = await createCheckout({
  type: 'PRODUCTS',
  product: customPriceProductId,  // Product configured with CUSTOM price in dashboard
  successUrl: '/checkout/success',
})
```

The customer enters their desired amount during checkout. For USD, amounts are in dollars (converted to cents internally). For SAT, amounts are in satoshis.

## Verify successful payments
When a checkout completes, use `useCheckoutSuccess()` on the success page
```tsx
'use client'

import { useCheckoutSuccess } from '@moneydevkit/nextjs'

export default function SuccessPage() {
  const { isCheckoutPaidLoading, isCheckoutPaid, metadata } = useCheckoutSuccess()

  if (isCheckoutPaidLoading || isCheckoutPaid === null) {
    return <p>Verifying payment…</p>
  }

  if (!isCheckoutPaid) {
    return <p>Payment has not been confirmed.</p>
  }

  // We set 'name' when calling navigate(), and it's accessible here on the success page.
  console.log('Customer name:', metadata?.name) // "John Doe"

  return (
    <div>
      <p>Payment confirmed. Enjoy your purchase!</p>
    </div>
  )
}
```

## L402: Pay-per-call API Endpoints

Gate any API route behind a Lightning payment using the [L402 protocol](https://github.com/lightning/blips/pull/26) (HTTP 402). No accounts, no subscriptions — clients pay a Lightning invoice and get immediate access.

### How it works

```
Client                          Your Server                    Lightning
  │                                │                              │
  │  GET /api/premium              │                              │
  │──────────────────────────────► │                              │
  │                                │                              │
  │  402 Payment Required          │                              │
  │  { invoice, macaroon, amount } │                              │
  │ ◄────────────────────────────  │                              │
  │                                │                              │
  │  pay invoice ──────────────────┼────────────────────────────► │
  │  ◄── preimage ─────────────────┼──────────────────────────────│
  │                                │                              │
  │  GET /api/premium              │                              │
  │  Authorization: L402 <macaroon>:<preimage>                     │
  │──────────────────────────────► │                              │
  │                                │  verify credential + preimage│
  │  200 OK { data }               │                              │
  │ ◄────────────────────────────  │                              │
```

1. Client requests a protected endpoint without credentials
2. Server returns **402** with a Lightning invoice and a signed credential
3. Client pays the invoice and receives a preimage (proof of payment)
4. Client retries with `Authorization: L402 <macaroon>:<preimage>`
5. Server verifies the credential, expiry, and preimage — then forwards to the handler

### Setup

Make sure `MDK_ACCESS_TOKEN` is set in your environment (same key used for checkout):

```env
MDK_ACCESS_TOKEN=your_api_key_here
MDK_MNEMONIC=your_mnemonic_here
```

### Basic usage

```ts
// app/api/premium/route.ts
import { withPayment } from '@moneydevkit/nextjs/server'

const handler = async (req: Request) => {
  return Response.json({ content: 'Premium data' })
}

export const GET = withPayment(
  { amount: 100, currency: 'SAT' },
  handler,
)
```

Every `GET /api/premium` request without valid credentials returns a 402 with a Lightning invoice. After payment, the same request with the authorization header returns the premium data.

### Dynamic pricing

Pass a function instead of a fixed number to compute the price from the request:

```ts
// app/api/ai/route.ts
import { withPayment } from '@moneydevkit/nextjs/server'

const handler = async (req: Request) => {
  const { model } = await req.json()
  const result = await runInference(model)
  return Response.json({ result })
}

export const POST = withPayment(
  {
    amount: (req: Request) => {
      const url = new URL(req.url)
      const tier = url.searchParams.get('tier')
      if (tier === 'pro') return 500
      return 100
    },
    currency: 'SAT',
  },
  handler,
)
```

The pricing function is evaluated both when creating the invoice and when verifying the credential. If the price changes between issuance and verification (e.g., the client replays a cheap credential on an expensive tier), the request is rejected with `amount_mismatch`.

### Fiat pricing

Use `currency: 'USD'` to price in US cents. The SDK converts to sats at the current exchange rate when generating the invoice:

```ts
export const GET = withPayment(
  { amount: 50, currency: 'USD' },  // $0.50
  handler,
)
```

### Credential expiry

Credentials (and their invoices) expire after 15 minutes by default. Override with `expirySeconds`:

```ts
export const GET = withPayment(
  { amount: 100, currency: 'SAT', expirySeconds: 300 },  // 5 minutes
  handler,
)
```

### Client integration

Any HTTP client can consume an L402 endpoint:

```bash
# 1. Request the protected resource
curl -s https://example.com/api/premium

# Response: 402
# {
#   "macaroon": "eyJ...",
#   "invoice": "lnbc...",
#   "paymentHash": "abc123...",
#   "amountSats": 100,
#   "expiresAt": 1234567890
# }

# 2. Pay the invoice with any Lightning wallet and get the preimage

# 3. Retry with the credential and preimage
curl -s https://example.com/api/premium \
  -H "Authorization: L402 eyJ...:ff00aa..."

# Response: 200 { "content": "Premium data" }
```

The `WWW-Authenticate` header follows the bLIP-26 format:

```
WWW-Authenticate: L402 macaroon="eyJ...", invoice="lnbc..."
```

### Programmatic client (Node.js / agent)

```ts
async function callPaidEndpoint(url: string, payFn: (invoice: string) => Promise<string>) {
  // Step 1: get the 402 challenge
  const challenge = await fetch(url)
  if (challenge.status !== 402) return challenge

  // The credential is in the `macaroon` field (L402 naming convention)
  const { macaroon: credential, invoice } = await challenge.json()

  // Step 2: pay the invoice (returns preimage)
  const preimage = await payFn(invoice)

  // Step 3: retry with credential + proof of payment
  return fetch(url, {
    headers: { Authorization: `L402 ${credential}:${preimage}` },
  })
}
```

### Deferred settlement

By default, `withPayment` marks the credential as used immediately before your handler runs. If your handler fails after the credential is consumed, the payer can't retry.

Use `withDeferredSettlement` when the service delivery might fail and you want the payer to be able to retry. Your handler receives a `settle()` callback - call it only after you've successfully delivered the service:

```ts
// app/api/ai/route.ts
import { withDeferredSettlement, type SettleResult } from '@moneydevkit/nextjs/server'

const handler = async (req: Request, settle: () => Promise<SettleResult>) => {
  const { prompt } = await req.json()

  // Do the expensive work first
  const result = await runAiInference(prompt)

  // Work succeeded - now mark the credential as used
  const { settled } = await settle()
  if (!settled) {
    return Response.json({ error: 'settlement_failed' }, { status: 500 })
  }

  return Response.json({ result })
}

export const POST = withDeferredSettlement(
  { amount: 100, currency: 'SAT' },
  handler,
)
```

If your handler returns without calling `settle()` (e.g. it throws or the service fails), the credential stays valid and the payer can retry with the same macaroon and preimage.

`settle()` is callable only once per request. A second call returns `{ settled: false, error: 'already_settled' }` without hitting the backend.

### Error codes

| Status | Code | Meaning |
|--------|------|---------|
| 402 | `payment_required` | No credentials provided - pay the returned invoice |
| 401 | `invalid_credential` | Credential is malformed, has a bad signature, or the L402 header is garbled |
| 401 | `invalid_payment_proof` | Preimage does not match the payment hash |
| 401 | `credential_consumed` | Credential has already been used |
| 403 | `resource_mismatch` | Credential was issued for a different endpoint |
| 403 | `amount_mismatch` | Credential was issued for a different price |
| 500 | `configuration_error` | `MDK_ACCESS_TOKEN` is not set |
| 500 | `pricing_error` | Dynamic pricing function threw an error |
| 502 | `checkout_creation_failed` | Failed to create the checkout or invoice |

> **Note:** A 402 is only returned when no L402/LSAT authorization header is present. If the header is present but malformed or invalid, you get a 401 - not a new invoice.
