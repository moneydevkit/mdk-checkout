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
      products: [productId],
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
- **`type: 'PRODUCTS'`** - For selling products. Requires `products` array with product IDs. Amount is calculated from product prices.

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