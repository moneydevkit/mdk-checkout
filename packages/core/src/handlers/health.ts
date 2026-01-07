/**
 * Health handler for webhook verification.
 *
 * MDK servers call this endpoint to verify that the webhook URL is reachable
 * before allowing checkout creation. This handler responds quickly without
 * spinning up the Lightning node.
 *
 * Returns a hash of the access token so MDK servers can verify
 * this is the correct app (not just any server at that URL).
 */
export async function handleHealth(): Promise<Response> {
  const accessToken = process.env.MDK_ACCESS_TOKEN

  if (!accessToken) {
    return new Response(JSON.stringify({ ok: false, error: 'MDK_ACCESS_TOKEN not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Hash the access token so we don't expose it, but MDK servers can verify it matches
  const encoder = new TextEncoder()
  const data = encoder.encode(accessToken)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return new Response(JSON.stringify({ ok: true, tokenHash }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
