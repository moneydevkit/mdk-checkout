# @moneydevkit/better-auth

Better Auth plugin for MoneyDevKit. Automatically links authenticated users to MDK customers.

## Installation

```bash
npm install @moneydevkit/better-auth better-auth
```

You'll also need a MoneyDevKit UI package for your framework:
- [Next.js](https://github.com/moneydevkit/mdk-checkout/tree/main/packages/nextjs)
- [Replit](https://github.com/moneydevkit/mdk-checkout/tree/main/packages/replit)

## Setup

### 1. Environment variables

```bash
MDK_ACCESS_TOKEN=your_api_key
MDK_MNEMONIC=your_wallet_mnemonic
```

### 2. Server plugin

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth"
import { moneydevkit } from "@moneydevkit/better-auth"

export const auth = betterAuth({
  // ... your config
  plugins: [moneydevkit()]
})
```

### 3. Client plugin

```tsx
import { createAuthClient } from "better-auth/react"
import { moneydevkitClient } from "@moneydevkit/better-auth/client"

const authClient = createAuthClient({
  plugins: [moneydevkitClient()]
})

// Same API as useCheckout().createCheckout from @moneydevkit/nextjs
const result = await authClient.createCheckout({
  type: 'AMOUNT',
  amount: 500,
  currency: 'USD',
  successUrl: '/checkout/success',
})

if (result.data) {
  window.location.href = result.data.checkoutUrl
}
```

### 4. Framework setup

Follow the setup guide for your framework's MoneyDevKit package (route handler, checkout page, config):
- [Next.js setup](https://github.com/moneydevkit/mdk-checkout/tree/main/packages/nextjs#quick-start-nextjs-app-router)
- [Replit setup](https://github.com/moneydevkit/mdk-checkout/tree/main/packages/replit#setup)

## How it works

The plugin adds a `/moneydevkit/checkout` endpoint that:
- If user is authenticated: maps `user.id` → `customer.externalId`, auto-fills email/name
- If no session: creates checkout without customer info (guest checkout)

This links all checkouts to the same MDK customer record for returning users.