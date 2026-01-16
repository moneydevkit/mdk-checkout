declare module '@tryghost/admin-api' {
  interface GhostAdminAPIOptions {
    url: string
    key: string
    version: string
  }

  interface Member {
    id: string
    email: string
    name?: string
    tiers?: Array<{
      id: string
      expiry_at?: string
    }>
  }

  interface MemberAddInput {
    email: string
    name?: string
  }

  interface MemberEditInput {
    tiers?: Array<{
      id: string
      expiry_at?: string
    }>
  }

  interface MembersAPI {
    browse(options?: { filter?: string }): Promise<Member[]>
    add(member: MemberAddInput): Promise<Member>
    edit(id: string, data: MemberEditInput): Promise<Member>
  }

  class GhostAdminAPI {
    constructor(options: GhostAdminAPIOptions)
    members: MembersAPI
  }

  export default GhostAdminAPI
}
