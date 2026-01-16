MDK Server Package - Final Spec (Simplified v2)

Overview

Two parts:

@moneydevkit/server - Next.js app with Ghost Admin API integration

Flow:

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


# Required - Default redirect
SUCCESS_URL=https://yourblog.com/thank-you

# Required - Ghost integration
GHOST_URL=https://yourblog.ghost.io
GHOST_ADMIN_API_KEY=abc:xyz

# Optional - Preview mode
MDK_PREVIEW=true

Checkout URL Format


/api/mdk/route.ts

Extends core handler with Ghost sync on success:

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

/error (page.tsx)

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

Ghost Integration

src/lib/ghost.ts

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

On Ghost Site

<a href="https://my-mdk.vercel.app/checkout?amount=500&...&sig=abc">
  Subscribe for $5/month
</a>
