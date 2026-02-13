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

## MDK402: Pay-per-call API Endpoints

Gate any API route behind a Lightning payment using the HTTP 402 protocol. No accounts, no subscriptions — clients pay a Lightning invoice and get immediate access.

### How it works

```
Client                          Your Server                    Lightning
  │                                │                              │
  │  GET /api/premium              │                              │
  │──────────────────────────────► │                              │
  │                                │                              │
  │  402 Payment Required          │                              │
  │  { invoice, token, amount }    │                              │
  │ ◄────────────────────────────  │                              │
  │                                │                              │
  │  pay invoice ──────────────────┼────────────────────────────► │
  │  ◄── preimage ─────────────────┼──────────────────────────────│
  │                                │                              │
  │  GET /api/premium              │                              │
  │  Authorization: MDK402 <token>:<preimage>                     │
  │──────────────────────────────► │                              │
  │                                │  verify token + preimage     │
  │  200 OK { data }               │                              │
  │ ◄────────────────────────────  │                              │
```

1. Client requests a protected endpoint without credentials
2. Server returns **402** with a Lightning invoice and a signed token
3. Client pays the invoice and receives a preimage (proof of payment)
4. Client retries with `Authorization: MDK402 <token>:<preimage>`
5. Server verifies the token, expiry, and preimage — then forwards to the handler

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

The pricing function is evaluated both when creating the invoice and when verifying the token. If the price changes between issuance and verification (e.g., the client replays a cheap token on an expensive tier), the request is rejected with `amount_mismatch`.

### Fiat pricing

Use `currency: 'USD'` to price in US cents. The SDK converts to sats at the current exchange rate when generating the invoice:

```ts
export const GET = withPayment(
  { amount: 50, currency: 'USD' },  // $0.50
  handler,
)
```

### Token expiry

Tokens (and their invoices) expire after 15 minutes by default. Override with `expirySeconds`:

```ts
export const GET = withPayment(
  { amount: 100, currency: 'SAT', expirySeconds: 300 },  // 5 minutes
  handler,
)
```

### Client integration

Any HTTP client can consume an MDK402 endpoint:

```bash
# 1. Request the protected resource
curl -s https://example.com/api/premium

# Response: 402
# {
#   "token": "eyJ...",
#   "invoice": "lnbc...",
#   "paymentHash": "abc123...",
#   "amountSats": 100,
#   "expiresAt": 1234567890
# }

# 2. Pay the invoice with any Lightning wallet and get the preimage

# 3. Retry with the token and preimage
curl -s https://example.com/api/premium \
  -H "Authorization: MDK402 eyJ...:ff00aa..."

# Response: 200 { "content": "Premium data" }
```

The `WWW-Authenticate` header also contains the token and invoice:

```
WWW-Authenticate: MDK402 token="eyJ...", invoice="lnbc..."
```

### Programmatic client (Node.js / agent)

```ts
async function callPaidEndpoint(url: string, payFn: (invoice: string) => Promise<string>) {
  // Step 1: get the 402 challenge
  const challenge = await fetch(url)
  if (challenge.status !== 402) return challenge

  const { token, invoice } = await challenge.json()

  // Step 2: pay the invoice (returns preimage)
  const preimage = await payFn(invoice)

  // Step 3: retry with proof of payment
  return fetch(url, {
    headers: { Authorization: `MDK402 ${token}:${preimage}` },
  })
}
```

### Error codes

| Status | Code | Meaning |
|--------|------|---------|
| 402 | `payment_required` | No valid credentials — pay the returned invoice |
| 401 | `invalid_token` | Token is malformed or has a bad signature |
| 401 | `invalid_payment_proof` | Preimage does not match the payment hash |
| 403 | `resource_mismatch` | Token was issued for a different endpoint |
| 403 | `amount_mismatch` | Token was issued for a different price |
| 500 | `configuration_error` | `MDK_ACCESS_TOKEN` is not set |
| 500 | `pricing_error` | Dynamic pricing function threw an error |
| 502 | `checkout_creation_failed` | Failed to create the checkout or invoice |