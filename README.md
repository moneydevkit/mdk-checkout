# mdk-checkout

Money Dev Kit checkout library for embedding Lightning-powered payments inside Next.js (App Router) apps.

## Setup
1. **Create a Money Dev Kit account** at [moneydevkit.com](https://moneydevkit.com) and grab your `api_key`, `webhook_key`, and mnemonic.
2. **Install the SDK** in your project:
   ```bash
   npm install mdk-checkout
   ```
3. **Add required secrets** to `.env` (or similar):
   ```env
   MDK_ACCESS_TOKEN=your_api_key_here
   MDK_WEBHOOK_SECRET=your_webhook_key_here
   MDK_MNEMONIC=your_mnemonic_here
   ```

## Quick Start (Next.js App Router)
### 1. Trigger a checkout from any client component
```jsx
// app/page.js
'use client'

import { useCheckout } from 'mdk-checkout'

export default function HomePage() {
  const { navigate, isNavigating } = useCheckout()

  const handlePurchase = () => {
    navigate({
      prompt: 'Describe the purchase shown to the buyer',
      amount: 500,         // 500 USD cents or Bitcoin sats
      currency: 'USD',     // or 'SAT'
      metadata: {
        type: 'my_type',
        customField: 'internal reference for this checkout',
        successUrl: '/checkout/success'
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
import { Checkout } from "mdk-checkout";
import { use } from "react";

export default function CheckoutPage({ params }) {
  const { id } = use(params);

  return <Checkout id={id} />;
}
```

### 3. Receive payment webhooks
```js
// app/api/webhooks/mdk/route.js
export { POST } from 'mdk-checkout/server/webhooks'
```

### 4. Configure Next.js
```js
// next.config.js / next.config.mjs
import withMdkCheckout from 'mdk-checkout/next-plugin'

export default withMdkCheckout({})
```

You now have a complete Lightning checkout loop: the button creates a session, the dynamic route renders it, and the webhook endpoint signals your Lightning node to claim paid invoices.
