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
 * Extract the node_id a signed claim is bound to, or null if the bytes are
 * not a well-formed claim. Parses the LSP verifier's wire layout
 * (rust-lightning fork, lsps4/claim.rs): SignedFeeClaim is a
 * BigSize-length-prefixed TLV of (0, payload: u16-BE-length-prefixed bytes)
 * and (2, 64-byte Schnorr sig); the payload is a BigSize-length-prefixed TLV
 * of (0, scheme = 1), (2, 33-byte node_id), (4, FeePolicy, Flat variant).
 * Structure and binding only; signature validity is the LSP's job.
 */
export function claimNodeId(claimHex: string): string | null {
  try {
    const bytes = fromHex(claimHex)
    const outer = new Cursor(bytes)
    const outerLen = outer.bigSize()
    if (outerLen !== outer.remaining()) return null

    outer.expectByte(0x00) // payload record
    const payloadRecordLen = outer.bigSize()
    const innerLen = (outer.byte() << 8) | outer.byte() // Vec<u8> u16-BE length
    if (payloadRecordLen !== innerLen + 2) return null
    const payload = outer.take(innerLen)

    outer.expectByte(0x02) // signature record
    if (outer.bigSize() !== 64) return null
    outer.take(64)
    if (outer.remaining() !== 0) return null

    const inner = new Cursor(payload)
    const payloadLen = inner.bigSize()
    if (payloadLen !== inner.remaining()) return null
    inner.expectByte(0x00) // scheme record
    if (inner.bigSize() !== 1 || inner.byte() !== 0x01) return null
    inner.expectByte(0x02) // node_id record
    if (inner.bigSize() !== 33) return null
    const nodeId = inner.take(33)
    if (nodeId[0] !== 0x02 && nodeId[0] !== 0x03) return null
    inner.expectByte(0x04) // policy record
    const policy = new Cursor(inner.take(inner.bigSize()))
    if (inner.remaining() !== 0) return null
    policy.expectByte(0x00) // FeePolicy::Flat variant tag
    const tier = new Cursor(policy.take(policy.bigSize()))
    if (policy.remaining() !== 0) return null
    const tierTag = tier.byte()
    const tierBody = new Cursor(tier.take(tier.bigSize()))
    if (tier.remaining() !== 0) return null
    if (tierTag === 0x00 || tierTag === 0x02) {
      // Standard / ZeroFee carry an empty TLV stream.
      if (tierBody.remaining() !== 0) return null
    } else if (tierTag === 0x04) {
      // Custom { ppm, base_msat }: two required 8-byte u64 records.
      tierBody.expectByte(0x00)
      if (tierBody.bigSize() !== 8) return null
      tierBody.take(8)
      tierBody.expectByte(0x02)
      if (tierBody.bigSize() !== 8) return null
      tierBody.take(8)
      if (tierBody.remaining() !== 0) return null
    } else {
      return null // unknown tier variant; the verifier would reject it
    }

    return Array.from(nodeId, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/** Byte reader for the claim TLV; throws past-the-end, caught by the caller. */
class Cursor {
  private offset = 0
  constructor(private readonly bytes: Uint8Array) {}

  /** Bytes left to read. */
  remaining(): number {
    return this.bytes.length - this.offset
  }

  /** Read one byte. */
  byte(): number {
    if (this.offset >= this.bytes.length) throw new Error('truncated')
    return this.bytes[this.offset++]
  }

  /** Read one byte and require it to equal `value`. */
  expectByte(value: number): void {
    if (this.byte() !== value) throw new Error('unexpected byte')
  }

  /** Read the next `n` bytes. */
  take(n: number): Uint8Array {
    if (this.remaining() < n) throw new Error('truncated')
    const out = this.bytes.slice(this.offset, this.offset + n)
    this.offset += n
    return out
  }

  /** BOLT BigSize; claims only ever use the 1- and 3-byte forms. */
  bigSize(): number {
    const first = this.byte()
    if (first < 0xfd) return first
    if (first === 0xfd) {
      const value = (this.byte() << 8) | this.byte()
      // LDK rejects non-minimal encodings; accepting one here would cache a
      // claim the verifier refuses to decode.
      if (value < 0xfd) throw new Error('non-canonical BigSize')
      return value
    }
    throw new Error('BigSize form larger than any claim')
  }
}

/** Decode lowercase hex into bytes; throws on odd length or stray chars. */
function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !CLAIM_HEX_RE.test(hex)) throw new Error('bad hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

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
    // A structurally broken claim would otherwise be cached permanently and
    // rejected by the LSP on every registration - a silent standard-rate
    // wallet with no self-healing (MDK-1328).
    const boundNodeId = claimNodeId(body.claim)
    if (!boundNodeId) {
      console.error('[fee-claim] mint endpoint returned an unparseable claim; ignoring')
      return null
    }
    if (boundNodeId !== nodeId) {
      console.error(`[fee-claim] claim is bound to ${boundNodeId}, not us; ignoring`)
      return null
    }
    return body.claim
  } catch (err) {
    console.error(`[fee-claim] mint request failed: ${err}; staying on standard rate`)
    return null
  }
}
