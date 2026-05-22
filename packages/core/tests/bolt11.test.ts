import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decodeBolt11AmountSats } from '../src/bolt11'

test('decodes a typical milli-bitcoin mainnet invoice (lnbc10m...)', () => {
  // 10 milli-BTC = 0.01 BTC = 1_000_000 sats
  assert.equal(decodeBolt11AmountSats('lnbc10m1pdummyrest'), 1_000_000)
})

test('decodes a typical micro-bitcoin mainnet invoice (lnbc1500u...)', () => {
  // 1500 micro-BTC = 150_000 sats
  assert.equal(decodeBolt11AmountSats('lnbc1500u1pdummyrest'), 150_000)
})

test('decodes a nano-bitcoin invoice that is a whole-sat amount (lnbc2500n...)', () => {
  // 2500 nano-BTC = 250 sats
  assert.equal(decodeBolt11AmountSats('lnbc2500n1pdummyrest'), 250)
})

test('returns null for a nano-bitcoin invoice that is sub-sat granular', () => {
  // 25 nano-BTC = 2.5 sats; not representable in sats.
  assert.equal(decodeBolt11AmountSats('lnbc25n1pdummyrest'), null)
})

test('returns null for any pico-bitcoin invoice below 10000p (sub-sat)', () => {
  // 1000 pico-BTC = 0.1 sats. Reject.
  assert.equal(decodeBolt11AmountSats('lnbc1000p1pdummyrest'), null)
})

test('decodes a pico-bitcoin invoice that is sat-granular (lnbc10000p...)', () => {
  // 10000 pico-BTC = 1 sat.
  assert.equal(decodeBolt11AmountSats('lnbc10000p1pdummyrest'), 1)
})

test('decodes a no-multiplier invoice as whole BTC', () => {
  // lnbc11... -> 1 BTC = 100_000_000 sats
  assert.equal(decodeBolt11AmountSats('lnbc11pdummyrest'), 100_000_000)
})

test('returns null for an amountless invoice (lnbc1...)', () => {
  assert.equal(decodeBolt11AmountSats('lnbc1pdummyrest'), null)
})

test('recognizes the testnet HRP prefix (lntb)', () => {
  assert.equal(decodeBolt11AmountSats('lntb500u1pdummyrest'), 50_000)
})

test('recognizes the regtest HRP prefix (lnbcrt) BEFORE the mainnet prefix', () => {
  // The regtest prefix shares the lnbc stem; if matched non-greedily this
  // would erroneously parse `lnbcrt500u...` as mainnet with amount=rt500u.
  // The regex puts lnbcrt before lnbc to win the precedence race.
  assert.equal(decodeBolt11AmountSats('lnbcrt500u1pdummyrest'), 50_000)
})

test('recognizes the signet HRP prefix (lntbs)', () => {
  assert.equal(decodeBolt11AmountSats('lntbs100u1pdummyrest'), 10_000)
})

test('strips the lightning: URI scheme before parsing', () => {
  assert.equal(decodeBolt11AmountSats('lightning:lnbc1500u1pdummy'), 150_000)
})

test('trims surrounding whitespace before parsing', () => {
  assert.equal(decodeBolt11AmountSats('   lnbc1500u1pdummy   '), 150_000)
})

test('case-insensitive HRP and multiplier (uppercase BOLT11 form)', () => {
  // BOLT11 can be uppercase (e.g. QR codes); the wire form is normally lower
  // but the spec allows uppercase as long as it isn't mixed.
  assert.equal(decodeBolt11AmountSats('LNBC1500U1PDUMMY'), 150_000)
})

test('rejects garbage input', () => {
  assert.equal(decodeBolt11AmountSats('not an invoice'), null)
  assert.equal(decodeBolt11AmountSats(''), null)
  // @ts-expect-error - explicitly testing wrong-type guard
  assert.equal(decodeBolt11AmountSats(null), null)
})

test('rejects amount=0 (BOLT11 forbids; treat as malformed)', () => {
  assert.equal(decodeBolt11AmountSats('lnbc0u1pdummyrest'), null)
})
