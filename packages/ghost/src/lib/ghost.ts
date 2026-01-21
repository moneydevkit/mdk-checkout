import jwt from 'jsonwebtoken'

export interface SyncToGhostParams {
  email?: string | null
  name?: string | null
  externalId?: string | null
  /** Ghost tier ID - if provided, used directly */
  ghostTierId?: string | null
  /** Product/tier name - if ghostTierId not provided, will find or create tier by this name */
  tierName?: string | null
  /** Price in cents - used when creating a new tier */
  priceAmount?: number | null
  months?: number
}

export interface SyncToGhostResult {
  synced: boolean
  memberId?: string
  tierId?: string
  tierName?: string
  status?: string
  error?: string
}

interface GhostMember {
  id: string
  email: string
  name?: string
  status: string
  tiers?: Array<{ id: string; name: string; expiry_at?: string }>
}

interface GhostTier {
  id: string
  name: string
  slug: string
  type: 'free' | 'paid'
  active: boolean
  monthly_price?: number
  yearly_price?: number
  currency?: string
}

function makeToken(): string {
  const key = process.env.GHOST_ADMIN_API_KEY
  if (!key) throw new Error('GHOST_ADMIN_API_KEY not configured')

  const [keyId, secret] = key.split(':')
  return jwt.sign({}, Buffer.from(secret, 'hex'), {
    keyid: keyId,
    algorithm: 'HS256',
    expiresIn: '5m',
    audience: '/admin/',
  })
}

async function ghostApi<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
  const ghostUrl = process.env.GHOST_URL
  if (!ghostUrl) throw new Error('GHOST_URL not configured')

  const token = makeToken()
  const url = `${ghostUrl}/ghost/api/admin/${endpoint}`

  console.log(`[ghost-api] ${method} ${endpoint}`)
  if (body) console.log('[ghost-api] Body:', JSON.stringify(body, null, 2))

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Ghost ${token}`,
      'Content-Type': 'application/json',
      'Accept-Version': 'v5.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`[ghost-api] Error: ${response.status} - ${text}`)
    throw new Error(`Ghost API ${method} ${endpoint} failed: ${response.status} - ${text}`)
  }

  const text = await response.text()
  const result = text ? JSON.parse(text) : ({} as T)
  console.log(`[ghost-api] Response:`, JSON.stringify(result, null, 2).slice(0, 500))
  return result
}

/**
 * Find a tier by name, or create it if it doesn't exist.
 */
async function findOrCreateTier(name: string, priceAmount?: number | null): Promise<GhostTier> {
  // Search for existing tier by name
  const { tiers } = await ghostApi<{ tiers: GhostTier[] }>('GET', 'tiers/')
  const existing = tiers.find(t => t.name.toLowerCase() === name.toLowerCase() && t.type === 'paid')

  if (existing) {
    // Reactivate if archived
    if (!existing.active) {
      const { tiers: [updated] } = await ghostApi<{ tiers: GhostTier[] }>(
        'PUT',
        `tiers/${existing.id}/`,
        { tiers: [{ active: true, visibility: 'public' }] }
      )
      return updated
    }
    return existing
  }

  // Create new tier
  const monthlyPrice = priceAmount || 500 // Default $5
  const yearlyPrice = monthlyPrice * 10   // 2 months free

  const { tiers: [created] } = await ghostApi<{ tiers: GhostTier[] }>(
    'POST',
    'tiers/',
    {
      tiers: [{
        name,
        description: `${name} membership`,
        type: 'paid',
        active: true,
        visibility: 'public',
        monthly_price: monthlyPrice,
        yearly_price: yearlyPrice,
        currency: 'usd',
      }]
    }
  )

  return created
}

export async function syncToGhost(params: SyncToGhostParams): Promise<SyncToGhostResult> {
  console.log('[ghost-sync] Starting sync with params:', params)

  if (!process.env.GHOST_URL || !process.env.GHOST_ADMIN_API_KEY) {
    console.log('[ghost-sync] Ghost not configured')
    return { synced: false, error: 'Ghost not configured' }
  }

  const maxRetries = 3

  for (let i = 0; i < maxRetries; i++) {
    console.log(`[ghost-sync] Attempt ${i + 1}/${maxRetries}`)
    try {
      // Resolve tier ID - either use provided ID or find/create by name
      let tierId = params.ghostTierId
      let tier: GhostTier | null = null

      if (!tierId && params.tierName) {
        console.log('[ghost-sync] Finding/creating tier:', params.tierName)
        tier = await findOrCreateTier(params.tierName, params.priceAmount)
        tierId = tier.id
        console.log('[ghost-sync] Tier resolved:', tierId)
      }

      if (!tierId) {
        console.log('[ghost-sync] No tier specified')
        return { synced: false, error: 'No tier specified (provide ghostTierId or tierName)' }
      }

      let member: GhostMember | null = null
      let isNewMember = false

      // Find by externalId first (externalId is actually the Ghost member id)
      if (params.externalId) {
        console.log('[ghost-sync] Looking up member by externalId:', params.externalId)
        const result = await ghostApi<{ members: GhostMember[] }>(
          'GET',
          `members/?filter=id:${params.externalId}&include=tiers`
        )
        member = result.members?.[0] || null
        console.log('[ghost-sync] Member by externalId:', member?.id || 'not found')
      }

      // If not found by externalId, try by email
      if (!member && params.email) {
        console.log('[ghost-sync] Looking up member by email:', params.email)
        // Use NQL filter syntax with URL-encoded quotes around email
        const emailFilter = encodeURIComponent(`email:'${params.email}'`)
        console.log('[ghost-sync] Email filter:', emailFilter)
        const result = await ghostApi<{ members: GhostMember[] }>(
          'GET',
          `members/?filter=${emailFilter}&include=tiers`
        )
        member = result.members?.[0] || null
        console.log('[ghost-sync] Member by email:', member?.id || 'not found')
      }

      // Create member if not found
      if (!member && params.email) {
        console.log('[ghost-sync] Creating new member')
        isNewMember = true

        // Calculate expiry
        const months = params.months || 1
        const expiryDate = new Date()
        expiryDate.setMonth(expiryDate.getMonth() + months)
        const tiers = [{ id: tierId, expiry_at: expiryDate.toISOString() }]

        // Add label with product name and note with expiry
        const labelName = tier?.name || params.tierName
        const labels = labelName ? [{ name: labelName }] : []
        const note = `Lightning payment - expires ${expiryDate.toISOString().split('T')[0]}`

        // IMPORTANT: Create member WITH tier in single call to get status=comped
        const result = await ghostApi<{ members: GhostMember[] }>(
          'POST',
          'members/?include=tiers',
          {
            members: [{
              email: params.email,
              name: params.name || undefined,
              tiers,
              labels,
              note,
            }]
          }
        )
        member = result.members[0]
        console.log('[ghost-sync] Created new member:', member.id, 'status:', member.status)
      }

      if (!member) {
        console.log('[ghost-sync] No member found and no email provided')
        return { synced: false, error: 'No member found and no email provided' }
      }

      // Grant/extend tier for existing members
      if (!isNewMember) {
        console.log('[ghost-sync] Updating existing member:', member.id)
        const months = params.months || 1
        const existing = member.tiers?.find((t) => t.id === tierId)
        const base = existing?.expiry_at ? new Date(existing.expiry_at) : new Date()
        base.setMonth(base.getMonth() + months)

        // Add label with product name and note with expiry
        const labelName = tier?.name || params.tierName
        const labels = labelName ? [{ name: labelName }] : []
        const note = `Lightning payment - expires ${base.toISOString().split('T')[0]}`

        const result = await ghostApi<{ members: GhostMember[] }>(
          'PUT',
          `members/${member.id}/?include=tiers`,
          {
            members: [{
              id: member.id,
              comped: true,
              tiers: [{ id: tierId, expiry_at: base.toISOString() }],
              labels,
              note,
            }]
          }
        )
        member = result.members[0]
        console.log('[ghost-sync] Updated member:', member.id, 'status:', member.status)
      }

      const successResult = {
        synced: true,
        memberId: member.id,
        tierId,
        tierName: tier?.name || params.tierName || undefined,
        status: member.status,
      }
      console.log('[ghost-sync] Success:', successResult)
      return successResult
    } catch (error) {
      console.error(`[ghost-sync] Error on attempt ${i + 1}:`, error)
      if (i === maxRetries - 1) {
        return { synced: false, error: String(error) }
      }
      // Exponential backoff
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }

  return { synced: false, error: 'Max retries exceeded' }
}
