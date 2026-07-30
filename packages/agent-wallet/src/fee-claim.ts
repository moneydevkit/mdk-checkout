/**
 * Agent-wallet fee-claim minting client (MDK-1271).
 *
 * Agent wallets pay a 0.5% LSP forwarding fee instead of the standard
 * merchant rate. The discount is a signed claim minted by moneydevkit.com,
 * bound to this node's id, fetched once and cached in the wallet config
 * forever; the node presents it to the LSP during LSPS4 registration.
 * Everything here is best-effort: any failure means the wallet runs at the
 * standard rate until the next daemon start retries.
 */

/** Lowercase-hex signed claim as returned by the mint endpoint. */
const CLAIM_HEX_RE = /^[0-9a-f]+$/

/**
 * The cached claim, but only if it was minted for `nodeId`. Claims are
 * node-bound; presenting one cached for a different node (possible when
 * MDK_WALLET_MNEMONIC overrides the config file) is worse than none.
 */
export function cachedClaimFor(
  config: { feeClaim?: string; feeClaimNodeId?: string },
  nodeId: string,
): string | null {
  return config.feeClaim && config.feeClaimNodeId === nodeId ? config.feeClaim : null
}

const MINT_TIMEOUT_MS = 5_000

/**
 * Request a fee claim for `nodeId` from the mint endpoint. Returns the claim
 * hex, or null on any refusal or failure (never throws): 403 means this node
 * is org-registered and stays on the standard rate; 503 means minting is
 * currently disabled; anything else is transient.
 */
export async function fetchFeeClaim(
  nodeId: string,
  mintUrl: string,
  timeoutMs: number = MINT_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const res = await fetch(mintUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      console.error(`[fee-claim] mint endpoint returned ${res.status}; staying on standard rate`)
      return null
    }
    const body = (await res.json()) as { claim?: unknown }
    if (typeof body.claim !== 'string' || !CLAIM_HEX_RE.test(body.claim)) {
      console.error('[fee-claim] mint endpoint returned a malformed claim; ignoring')
      return null
    }
    return body.claim
  } catch (err) {
    console.error(`[fee-claim] mint request failed: ${err}; staying on standard rate`)
    return null
  }
}
