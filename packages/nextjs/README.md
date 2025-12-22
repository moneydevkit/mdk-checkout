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

export default function HomePage() {
  const { navigate, isNavigating } = useCheckout()

  const handlePurchase = () => {
    navigate({
      title: "Describe the purchase shown to the buyer",
      description: 'A description of the purchase',
      amount: 500,         // 500 USD cents or Bitcoin sats
      currency: 'USD',     // or 'SAT'
      successUrl: '/checkout/success',
      metadata: {
        type: 'my_type',
        customField: 'internal reference for this checkout',
        name: 'John Doe'
      }
    })
  }

  return (
    <button onClick={handlePurchase} disabled={isNavigating}>
      {isNavigating ? 'Creating checkout…' : 'Buy Now'}
    </button>
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
export { POST } from '@moneydevkit/nextjs/server/route'
```

### 4. Configure Next.js
```js
// next.config.js / next.config.mjs
import withMdkCheckout from '@moneydevkit/nextjs/next-plugin'

export default withMdkCheckout({})
```

You now have a complete Lightning checkout loop: the button creates a session, the dynamic route renders it, and the webhook endpoint signals your Lightning node to claim paid invoices.

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