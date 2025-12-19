# @moneydevkit/better-auth

Better Auth plugin for MoneyDevKit checkout integration. Accept Lightning payments with automatic user info attachment from authenticated sessions.

## Installation

```bash
npm install @moneydevkit/better-auth
```

## Quick Start

### 1. Set up environment variables

```bash
MDK_ACCESS_TOKEN=your_api_key
MDK_MNEMONIC=your_wallet_mnemonic
```

### 2. Add the server plugin

```typescript
// auth.ts
import { betterAuth } from "better-auth"
import { moneydevkit } from "@moneydevkit/better-auth"

export const auth = betterAuth({
  // ... your better-auth config
  plugins: [moneydevkit()]
})
```

### 3. Add the client plugin and create checkouts

```tsx
import { createAuthClient } from "better-auth/react"
import { moneydevkitClient } from "@moneydevkit/better-auth/client"

const authClient = createAuthClient({
  plugins: [moneydevkitClient()]
})

export function BuyButton() {
  const handlePurchase = async () => {
    await authClient.checkout({
      title: "Premium Plan",
      description: "Monthly subscription",
      amount: 500,        // 500 cents = $5.00 or 500 sats
      currency: "USD",    // or "SAT"
      successUrl: "/checkout/success",
      metadata: {
        planId: "premium"
      }
    })
  }

  return <button onClick={handlePurchase}>Buy Now</button>
}
```

### 4. Set up the MDK route handler (required for Checkout component)

The `<Checkout>` component from `@moneydevkit/nextjs` or `@moneydevkit/replit` needs a route at `/api/mdk`. You can use the exported handler:

**For Next.js (app/api/mdk/route.ts):**
```typescript
import { POST } from "@moneydevkit/better-auth"
export { POST }
```

**For Express:**
```typescript
import express from "express"
import { createUnifiedHandler } from "@moneydevkit/better-auth"

const app = express()
const mdkHandler = createUnifiedHandler()

app.post("/api/mdk", express.json(), async (req, res) => {
  const request = new Request("http://localhost/api/mdk", {
    method: "POST",
    headers: { "content-type": "application/json", ...req.headers },
    body: JSON.stringify(req.body),
  })
  const response = await mdkHandler(request)
  const data = await response.json()
  res.status(response.status).json(data)
})
```

### 5. Create the checkout page

Use the `<Checkout>` component to render the checkout UI:

```tsx
// app/checkout/[id]/page.tsx (Next.js)
import { Checkout } from "@moneydevkit/nextjs"
import "@moneydevkit/nextjs/mdk-styles.css"

export default function CheckoutPage({ params }: { params: { id: string } }) {
  return <Checkout id={params.id} />
}
```

## API Reference

### Server Plugin

The plugin adds the following endpoints to your Better Auth server:

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/moneydevkit/checkout` | POST | Session | Create a checkout with user info |
| `/moneydevkit/checkout/:id` | GET | Session | Get checkout status |
| `/moneydevkit/handler` | POST | Secret | Unified handler for all core routes |

The unified handler supports all core MDK routes:
- `webhook` / `webhooks` - Handle incoming payment notifications
- `balance` - Get Lightning node balance
- `ping` - Sync wallets and health check
- `pay_bolt11` - Pay a BOLT11 invoice
- `pay_bolt12` - Pay a BOLT12 offer
- `pay_ln_url` - Pay via LNURL
- `list_channels` - List Lightning channels

### Client Methods

#### `authClient.checkout(params, options?)`

Create a new checkout and optionally redirect to the checkout page.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | `string` | Yes | Title shown to the buyer |
| `description` | `string` | Yes | Description of the purchase |
| `amount` | `number` | Yes | Amount in cents (USD) or sats (SAT) |
| `currency` | `'USD' \| 'SAT'` | No | Currency type (default: `'USD'`) |
| `successUrl` | `string` | No | URL to redirect after payment |
| `checkoutPath` | `string` | No | Custom checkout page path (default: `/checkout`) |
| `metadata` | `Record<string, unknown>` | No | Custom metadata |

**Options:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `redirect` | `boolean` | `true` | Set to `false` to prevent auto-redirect |

**Returns:** `{ checkout, redirectUrl }`

#### `authClient.getCheckout(id)`

Get checkout status by ID.

**Returns:** `{ checkout }`

## User Info

When `includeUserInfo` is enabled (default), the following user information is automatically attached to each checkout:

```typescript
{
  userInfo: {
    userId: "user_123",
    userEmail: "user@example.com",
    userName: "John Doe"
  }
}
```

This data is available in the checkout's metadata and can be used for order fulfillment, CRM integration, etc.

## Serverless Deployment (Vercel, etc.)

This plugin works in serverless environments like Next.js on Vercel:

- **State Persistence**: The Lightning node uses VSS (Versioned State Storage) to persist wallet state across function invocations
- **Cold Starts**: First requests may have ~1-2s latency while syncing node state from VSS
- **Environment Variables**: Set `MDK_ACCESS_TOKEN` and `MDK_MNEMONIC` in your serverless platform's environment settings

```typescript
// next.config.js - ensure env vars are available server-side
module.exports = {
  env: {
    MDK_ACCESS_TOKEN: process.env.MDK_ACCESS_TOKEN,
    MDK_MNEMONIC: process.env.MDK_MNEMONIC,
  }
}
```

## Requirements

- Better Auth v1.0.0+
- Node.js 18+
- MDK_ACCESS_TOKEN and MDK_MNEMONIC environment variables

## Related Packages

- [@moneydevkit/nextjs](../nextjs) - Next.js integration with Checkout component
- [@moneydevkit/replit](../replit) - Replit/Express integration
- [@moneydevkit/core](../core) - Core checkout utilities

## License

MIT
