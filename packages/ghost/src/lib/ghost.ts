import GhostAdminAPI from '@tryghost/admin-api'

let ghost: GhostAdminAPI | null = null

function getGhostClient(): GhostAdminAPI | null {
  if (!ghost && process.env.GHOST_URL && process.env.GHOST_ADMIN_API_KEY) {
    ghost = new GhostAdminAPI({
      url: process.env.GHOST_URL,
      key: process.env.GHOST_ADMIN_API_KEY,
      version: 'v5.0',
    })
  }
  return ghost
}

export interface SyncToGhostParams {
  email?: string | null
  name?: string | null
  externalId?: string | null
  ghostTierId?: string | null
  months?: number
}

export interface SyncToGhostResult {
  synced: boolean
  memberId?: string
  error?: string
}

export async function syncToGhost(params: SyncToGhostParams): Promise<SyncToGhostResult> {
  const client = getGhostClient()

  if (!client) {
    return { synced: false, error: 'Ghost not configured' }
  }

  const maxRetries = 3

  for (let i = 0; i < maxRetries; i++) {
    try {
      let member = null

      // Find by externalId first
      if (params.externalId) {
        const members = await client.members.browse({
          filter: `id:${params.externalId}`,
        })
        member = members[0]
      }

      // If not found by externalId, try by email
      if (!member && params.email) {
        const members = await client.members.browse({
          filter: `email:${params.email}`,
        })
        member = members[0]
      }

      // Create member if not found
      if (!member && params.email) {
        member = await client.members.add({
          email: params.email,
          name: params.name || undefined,
        })
      }

      if (!member) {
        return { synced: false, error: 'No member found and no email provided' }
      }

      // Grant tier if specified
      if (params.ghostTierId) {
        const months = params.months || 1
        const existing = member.tiers?.find((t: { id: string }) => t.id === params.ghostTierId)
        const base = existing?.expiry_at ? new Date(existing.expiry_at) : new Date()
        base.setMonth(base.getMonth() + months)

        await client.members.edit(member.id, {
          tiers: [{ id: params.ghostTierId, expiry_at: base.toISOString() }],
        })
      }

      return { synced: true, memberId: member.id }
    } catch (error) {
      if (i === maxRetries - 1) {
        return { synced: false, error: String(error) }
      }
      // Exponential backoff
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }

  return { synced: false, error: 'Max retries exceeded' }
}
