/**
 * Minimal BOLT11 amount parser. Extracts the invoice amount in sats from the
 * human-readable part of a BOLT11 string. Returns `null` for an amountless
 * invoice or for input that doesn't look like a BOLT11 we recognize.
 *
 * Recognized HRP prefixes (case-insensitive):
 *   lnbc    Bitcoin mainnet
 *   lntb    Bitcoin testnet
 *   lntbs   Bitcoin signet
 *   lnsb    Bitcoin signet (alternate)
 *   lnbcrt  Bitcoin regtest
 *
 * Multiplier rules per BOLT 11 (value = pico-BTC * 10^decimal-shift):
 *   m (milli): X * 100_000 sats
 *   u (micro): X * 100 sats
 *   n (nano):  X / 10 sats           (must be divisible by 10)
 *   p (pico):  X / 10_000 sats       (must be divisible by 10_000)
 *   (none):    X * 100_000_000 sats  (X is whole-BTC)
 *
 * Sub-sat amounts (e.g. lnbc1p... = 0.0001 sats) return null because the
 * caller is comparing to a sat-precision cap.
 *
 * No bech32 / signature validation. Mints from a healthy L402 server are
 * well-formed; this is amount extraction only.
 */
export function decodeBolt11AmountSats(invoice: string): number | null {
  if (typeof invoice !== 'string') return null
  // Strip optional URI prefix and leading whitespace.
  const trimmed = invoice.trim().replace(/^lightning:/i, '')
  const match = trimmed.match(/^ln(?:bcrt|bc|tbs|tb|sb)(\d+)?([munp])?1/i)
  if (!match) return null
  const digits = match[1]
  const mult = match[2]?.toLowerCase()
  // Amountless invoice: HRP ends at the bech32 separator with no integer part.
  if (!digits) return null
  const amount = Number(digits)
  if (!Number.isFinite(amount) || amount <= 0) return null

  switch (mult) {
    case 'm':
      return amount * 100_000
    case 'u':
      return amount * 100
    case 'n':
      return amount % 10 === 0 ? amount / 10 : null
    case 'p':
      return amount % 10_000 === 0 ? amount / 10_000 : null
    case undefined:
      // No multiplier: amount is in whole BTC.
      return amount * 100_000_000
    default:
      return null
  }
}
