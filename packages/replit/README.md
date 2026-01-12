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
import { useState } from 'react'

export default function App() {
  const { createCheckout, isLoading } = useCheckout()
  const [error, setError] = useState<string | null>(null)

  const handlePurchase = async () => {
    setError(null)

    const result = await createCheckout({
      title: 'Purchase title for the buyer',
      description: 'Description of the purchase',
      amount: 500,
      currency: 'USD',
      successUrl: '/checkout/success',
      metadata: { name: 'John Doe' },
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

Render the hosted checkout page:
```tsx
// src/routes/checkout/[id].tsx (or similar)
import { Checkout } from '@moneydevkit/replit'

export default function CheckoutPage({ params }: { params: { id: string } }) {
  return <Checkout id={params.id} />
}
```

## Customer Data
Collect and store customer information with each checkout. Pass `customer` to pre-fill data and `requireCustomerData` to prompt the user for specific fields:

```tsx
const result = await createCheckout({
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

```tsx
const result = await createCheckout({
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
