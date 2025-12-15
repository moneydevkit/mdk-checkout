# @moneydevkit/replit

Money Dev Kit checkout package tuned for Replit workspaces: Vite + React on the client and Express on the server.

## Setup
1. **Create a Money Dev Kit account** at [moneydevkit.com](https://moneydevkit.com) (or run `npx @moneydevkit/create` locally) and grab your `api_key`, `webhook_key`, and mnemonic.
2. **Install the SDK** in your Replit project (Express is a peer dependency):
   ```bash
   npm install @moneydevkit/replit express
   ```
3. **Add required secrets** to `.env` (or Replit Secrets):
   ```env
   MDK_ACCESS_TOKEN=your_api_key_here
   MDK_MNEMONIC=your_mnemonic_here
   ```

## Backend: Express route
Mount the unified Money Dev Kit endpoint at `/api/mdk`:
```ts
// server/index.ts (or server.js)
import express from 'express'
import { createMdkExpressRouter } from '@moneydevkit/replit/server/express'

const app = express()
app.use('/api/mdk', createMdkExpressRouter())

app.listen(3000, () => {
  console.log('Server listening on http://localhost:3000')
})
```

## Frontend: Vite + React
Trigger a checkout from your client code (the checkout component pulls in its own CSS; import `@moneydevkit/replit/mdk-styles.css` once globally only if you want to preload it):
```tsx
// src/App.tsx
import { useCheckout } from '@moneydevkit/replit'

export default function App() {
  const { navigate, isNavigating } = useCheckout()

  return (
    <button
      onClick={() =>
        navigate({
          title: 'Purchase title for the buyer',
          description: 'Description of the purchase',
          amount: 500,
          currency: 'USD',
          metadata: { successUrl: '/checkout/success' },
        })
      }
      disabled={isNavigating}
    >
      {isNavigating ? 'Creating checkout…' : 'Buy Now'}
    </button>
  )
}
```

Render the hosted checkout page:
```tsx
// src/routes/checkout/[id].tsx (or similar)
import { Checkout } from '@moneydevkit/replit'

export default function CheckoutPage({ params }: { params: { id: string } }) {
  return <Checkout id={params.id} />
}
```

Verify successful payments:
```tsx
import { useCheckoutSuccess } from '@moneydevkit/replit'

export function SuccessPage() {
  const { isCheckoutPaidLoading, isCheckoutPaid, metadata } = useCheckoutSuccess()

  if (isCheckoutPaidLoading || isCheckoutPaid === null) return <p>Verifying payment…</p>
  if (!isCheckoutPaid) return <p>Payment has not been confirmed.</p>

  return <p>Payment confirmed for {metadata?.name ?? 'customer'}.</p>
}
```

This wiring keeps the client pointed at `/api/mdk`, which the Express route handles by delegating to the shared Money Dev Kit core logic.
