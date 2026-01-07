# MDK Server Package - Final Spec (Simplified v2)

## Overview

Two parts:
1. **@moneydevkit/core** - New handler `new-checkout-from-url` that creates checkout from signed URL params
2. **@moneydevkit/server** - Next.js app with Ghost Admin API integration

**Flow:**
```
Ghost site links to:
  https://my-mdk.vercel.app/checkout?amount=500&email=x&ghostTierId=y&sig=z
                              ↓
           /checkout page verifies sig, creates checkout via core
                              ↓
                    User sees checkout, pays
                              ↓
              Ghost API called → member tier updated
                              ↓
              Redirect back to success_url
```

---

## Part 1: Core Changes

### New Handler: `new-checkout-from-url`

Add to `packages/core/src/handlers/`:

```typescript
// packages/core/src/handlers/new-checkout-from-url.ts
import { createCheckout } from '../actions'

export interface NewCheckoutFromUrlParams {
  amount: number
  currency?: 'USD' | 'SAT'
  title: string
  description?: string
  email?: string
  name?: string
  metadata?: Record<string, string>  // externalId, ghostTierId, months, etc.
  successUrl?: string
}

export async function handleNewCheckoutFromUrl(
  params: NewCheckoutFromUrlParams
): Promise<{ checkoutId: string; checkoutUrl: string }> {
  const result = await createCheckout({
    amount: params.amount,
    currency: params.currency || 'USD',
    title: params.title,
    description: params.description,
    customer: params.email ? { email: params.email, name: params.name } : undefined,
    metadata: params.metadata,
    successUrl: params.successUrl
  })

  if (result.error) {
    throw new Error(result.error.message)
  }

  return {
    checkoutId: result.data.id,
    checkoutUrl: result.data.checkoutUrl
  }
}
```

### Signature Utilities (in core)

```typescript
// packages/core/src/lib/signature.ts
import crypto from 'crypto'

export interface SignedCheckoutParams {
  amount: number
  currency?: 'USD' | 'SAT'
  title: string
  description?: string
  email?: string
  name?: string
  externalId?: string
  ghostTierId?: string
  months?: number
  success_url?: string
}

export function createSignedCheckoutUrl(
  baseUrl: string,
  params: SignedCheckoutParams,
  secret: string
): string {
  const searchParams = new URLSearchParams()

  const entries = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))

  for (const [key, value] of entries) {
    searchParams.set(key, String(value))
  }

  const sig = crypto
    .createHmac('sha256', secret)
    .update(searchParams.toString())
    .digest('hex')

  searchParams.set('sig', sig)

  return `${baseUrl}/checkout?${searchParams.toString()}`
}

export function verifyCheckoutSignature(
  params: Record<string, string>,
  secret: string
): boolean {
  const { sig, ...rest } = params
  if (!sig) return false

  const searchParams = new URLSearchParams()
  const entries = Object.entries(rest)
    .filter(([_, v]) => v !== undefined && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))

  for (const [key, value] of entries) {
    searchParams.set(key, value)
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(searchParams.toString())
    .digest('hex')

  return sig === expected
}
```

### Core Exports

```typescript
// packages/core/src/index.ts - ADD:
export { createSignedCheckoutUrl, verifyCheckoutSignature } from './lib/signature'
export type { SignedCheckoutParams } from './lib/signature'
export { handleNewCheckoutFromUrl } from './handlers/new-checkout-from-url'
```

---

## Part 2: Server Package

### Package Structure

```
packages/server/
├── package.json
├── tsconfig.json
├── next.config.js
├── .env.example
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── checkout/
│   │   │   └── page.tsx          # Verifies sig, renders Checkout
│   │   ├── api/
│   │   │   └── mdk/
│   │   │       └── route.ts      # MDK API + Ghost sync on success
│   │   └── error/
│   │       └── page.tsx          # Error pages
│   │
│   └── lib/
│       └── ghost.ts              # Ghost Admin API client
│
└── vercel.json
```

### Environment Variables

```bash
# Required - MDK credentials
MDK_ACCESS_TOKEN=mdk_xxx
MDK_MNEMONIC="twelve word seed phrase"

# Required - URL signing
CHECKOUT_SECRET=random-secret-for-hmac

# Required - Default redirect
SUCCESS_URL=https://yourblog.com/thank-you

# Required - Ghost integration
GHOST_URL=https://yourblog.ghost.io
GHOST_ADMIN_API_KEY=abc:xyz

# Optional - Preview mode
MDK_PREVIEW=true

# Optional - Support email for error pages
SUPPORT_EMAIL=support@yourblog.com
```

---

## Checkout URL Format

```
https://my-mdk.vercel.app/checkout?
  amount=500
  &currency=USD
  &title=Premium%20Access
  &email=user@example.com
  &externalId=member_123
  &ghostTierId=tier_abc
  &months=1
  &success_url=https://blog.com/welcome
  &sig=a1b2c3...
```

| Param | Required | Description |
|-------|----------|-------------|
| `amount` | Yes | Amount in cents (USD) or sats (SAT) |
| `currency` | No | USD or SAT (default: USD) |
| `title` | Yes | Payment title |
| `description` | No | Optional description |
| `email` | Yes | Customer email (required for Ghost) |
| `name` | No | Customer name |
| `externalId` | No | Ghost member ID |
| `ghostTierId` | No | Ghost tier to grant |
| `months` | No | Months of access |
| `success_url` | No | Override SUCCESS_URL |
| `sig` | Yes | HMAC-SHA256 signature |

---

## Pages

### /checkout (page.tsx)

```typescript
// src/app/checkout/page.tsx
import { verifyCheckoutSignature } from '@moneydevkit/core'
import { redirect } from 'next/navigation'
import { Checkout } from '@moneydevkit/core/components'

export default async function CheckoutPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams

  // Verify signature
  if (!verifyCheckoutSignature(params, process.env.CHECKOUT_SECRET!)) {
    redirect('/error?type=invalid_signature')
  }

  const { amount, currency, title, description, email, name, sig, ...metadata } = params

  return (
    <Checkout
      amount={parseInt(amount)}
      currency={(currency as 'USD' | 'SAT') || 'USD'}
      title={title}
      description={description}
      customer={{ email, name }}
      metadata={metadata}
      successUrl={`/api/mdk/success?${new URLSearchParams(params).toString()}`}
    />
  )
}
```

### /api/mdk/route.ts

Extends core handler with Ghost sync on success:

```typescript
// src/app/api/mdk/route.ts
import { POST as corePOST } from '@moneydevkit/nextjs/server/route'
import { syncToGhost } from '@/lib/ghost'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.clone().json()

  // Call core handler
  const response = await corePOST(request)
  const result = await response.json()

  // If checkout completed, sync to Ghost
  if (result.status === 'PAYMENT_RECEIVED' && process.env.GHOST_URL) {
    const ghostResult = await syncToGhost({
      email: result.customer?.email,
      name: result.customer?.name,
      externalId: result.metadata?.externalId,
      ghostTierId: result.metadata?.ghostTierId,
      months: parseInt(result.metadata?.months || '1')
    })

    // Include Ghost result in response
    return NextResponse.json({ ...result, ghost: ghostResult })
  }

  return NextResponse.json(result)
}
```

### /error (page.tsx)

```typescript
// src/app/error/page.tsx
export default async function ErrorPage({
  searchParams
}: {
  searchParams: Promise<{ type: string; checkoutId?: string }>
}) {
  const { type, checkoutId } = await searchParams
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@example.com'

  if (type === 'invalid_signature') {
    return (
      <div>
        <h1>Invalid Checkout Link</h1>
        <p>This payment link is invalid or has been tampered with.</p>
        <p>Please request a new link.</p>
        <p>Need help? Contact {supportEmail}</p>
      </div>
    )
  }

  if (type === 'ghost_sync_failed') {
    return (
      <div>
        <h1>Payment Received</h1>
        <p>Your payment was successful, but we couldn't update your account.</p>
        <p>Please contact {supportEmail}</p>
        <p>Reference: {checkoutId}</p>
      </div>
    )
  }

  return <div>An error occurred</div>
}
```

---

## Ghost Integration

### src/lib/ghost.ts

```typescript
import GhostAdminAPI from '@tryghost/admin-api'

let ghost: GhostAdminAPI | null = null

function getGhostClient() {
  if (!ghost && process.env.GHOST_URL && process.env.GHOST_ADMIN_API_KEY) {
    ghost = new GhostAdminAPI({
      url: process.env.GHOST_URL,
      key: process.env.GHOST_ADMIN_API_KEY,
      version: 'v5.0'
    })
  }
  return ghost
}

export async function syncToGhost(params: {
  email?: string
  name?: string
  externalId?: string
  ghostTierId?: string
  months?: number
}): Promise<{ synced: boolean; memberId?: string; error?: string }> {
  const client = getGhostClient()
  if (!client) return { synced: false, error: 'Ghost not configured' }

  const maxRetries = 3

  for (let i = 0; i < maxRetries; i++) {
    try {
      let member = null

      // Find by externalId
      if (params.externalId) {
        const members = await client.members.browse({
          filter: `id:${params.externalId}`
        })
        member = members[0]
      }

      // Create if not found
      if (!member && params.email) {
        member = await client.members.add({
          email: params.email,
          name: params.name
        })
      }

      if (!member) {
        return { synced: false, error: 'No member found and no email provided' }
      }

      // Grant tier
      if (params.ghostTierId) {
        const months = params.months || 1
        const existing = member.tiers?.find((t: any) => t.id === params.ghostTierId)
        const base = existing?.expiry_at ? new Date(existing.expiry_at) : new Date()
        base.setMonth(base.getMonth() + months)

        await client.members.edit(member.id, {
          tiers: [{ id: params.ghostTierId, expiry_at: base.toISOString() }]
        })
      }

      return { synced: true, memberId: member.id }
    } catch (error) {
      if (i === maxRetries - 1) {
        return { synced: false, error: String(error) }
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }

  return { synced: false, error: 'Max retries exceeded' }
}
```

---

## Usage

### Generate Signed URL (from Ghost backend/Zapier)

```typescript
import { createSignedCheckoutUrl } from '@moneydevkit/core'

const url = createSignedCheckoutUrl(
  'https://my-mdk.vercel.app',
  {
    amount: 500,
    title: 'Monthly Subscription',
    email: 'user@example.com',
    ghostTierId: 'tier_premium',
    months: 1
  },
  process.env.CHECKOUT_SECRET!
)

// Returns: https://my-mdk.vercel.app/checkout?amount=500&...&sig=abc
```

### On Ghost Site

```html
<a href="https://my-mdk.vercel.app/checkout?amount=500&...&sig=abc">
  Subscribe for $5/month
</a>
```

---

## Implementation Checklist

### Core Changes
- [ ] Add `packages/core/src/lib/signature.ts`
- [ ] Add `packages/core/src/handlers/new-checkout-from-url.ts`
- [ ] Export from `packages/core/src/index.ts`
- [ ] Add MDK_PREVIEW check to `is_preview_environment()`

### Server Package
- [ ] Create `packages/server/` structure
- [ ] `package.json` with Next.js + @tryghost/admin-api
- [ ] `next.config.js` with MDK plugin
- [ ] `/checkout` page
- [ ] `/api/mdk` route with Ghost sync
- [ ] `/error` page
- [ ] `lib/ghost.ts`
- [ ] `vercel.json`
- [ ] `.env.example`
- [ ] README

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/core/src/lib/signature.ts` | URL signing utilities |
| `packages/server/package.json` | Package config |
| `packages/server/next.config.js` | Next.js config |
| `packages/server/src/app/checkout/page.tsx` | Checkout page |
| `packages/server/src/app/api/mdk/route.ts` | API with Ghost sync |
| `packages/server/src/app/error/page.tsx` | Error pages |
| `packages/server/src/lib/ghost.ts` | Ghost Admin API |

---

## Removed from Scope

- ~~Generic webhook~~ → Ghost API only
- ~~Express server~~ → Next.js only
- ~~Railway, Render, Docker~~ → Vercel only
- ~~Embedded widget~~ → Redirect only
- ~~Admin dashboard~~ → Use MDK dashboard
