# mdk-checkout

Money Dev Kit checkout components, providers, and server helpers for embedding Lightning-based checkout flows into Next.js applications.

## Installation & Setup

Before using this library, you need to:

1. **Get API credentials**: Go to [moneydevkit.com](https://moneydevkit.com), create an account, and obtain your `api_key` and `webhook_key`.

2. **Install the package**:
```bash
npm install mdk-checkout
```

3. **Configure environment variables** in your `.env` file:
```env
MDK_ACCESS_TOKEN=your_api_key_here
MDK_WEBHOOK_SECRET=your_webhook_key_here
MDK_MNEMONIC=your_mnemonic_here
```

## Quick Start

### 1. Use the `useCheckout` Hook

The easiest way to integrate checkout is with the `useCheckout` hook:

```jsx
// app/page.js
'use client'

import { useCheckout } from 'mdk-checkout'

export default function HomePage() {
  const { navigate, isNavigating } = useCheckout()

  const handlePurchase = () => {
    navigate({
      prompt: "Custom AI image generation",
      amount: 500,        // Amount in cents (USD) or sats
      currency: "USD",    // or "SAT"
      metadata: {
        type: "image_generation",
        customField: "value",
        successUrl: "/joke/basic"  // Custom redirect after successful payment
      }
    })
  }

  return (
    <button
      onClick={handlePurchase}
      disabled={isNavigating}
    >
      {isNavigating ? 'Creating checkout...' : 'Buy Now'}
    </button>
  )
}
```

### 2. Create Checkout Page

Create a dynamic route to handle checkout pages:

```jsx
// app/checkout/[id]/page.js
'use client'

import { Checkout } from 'mdk-checkout'
import { use } from 'react'

export default function CheckoutPage({ params }) {
  const { id } = use(params)

  return (
    <Checkout
      id={id}
    />
  )
}
```

### 3. Handle Webhooks

Create a webhook endpoint to receive payment notifications:

```js
// app/api/webhooks/mdk/route.js
export { POST } from 'mdk-checkout/server/webhooks'
```

## Environment Variables

Required environment variables:

- `MDK_ACCESS_TOKEN` - Your Money Dev Kit API key
- `MDK_WEBHOOK_SECRET` - Your webhook secret key
- `MDK_MNEMONIC` - Your wallet mnemonic (optional)