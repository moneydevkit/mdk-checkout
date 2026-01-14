import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import {
  detectPayoutAddressType,
  getPayoutConfig,
  getPayoutAddressForType,
  hasPayoutAddress,
  __resetDeprecationWarnings,
} from '../src/payout-address'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env = { ...originalEnv }
  delete process.env.PAYOUT_ADDRESS
  delete process.env.WITHDRAWAL_BOLT_11
  delete process.env.WITHDRAWAL_BOLT_12
  delete process.env.WITHDRAWAL_LNURL
  __resetDeprecationWarnings()
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('detectPayoutAddressType', () => {
  test('detects Bolt12 offer', () => {
    const address = 'lno1pg257enxv4ezqcneype82um50ynhxgrwdajx283qfwdpl28qqmc78ymlvhmxcsywdk5wrjnj36jryg488qwlrnzyjczlqs85ck65ycmkdk92smwt9zuewdzfe7v4aavvaz5kgv9mkk63v3s0'
    assert.equal(detectPayoutAddressType(address), 'bolt12')
  })

  test('detects Bolt12 offer case insensitive', () => {
    const address = 'LNO1pg257enxv4ezqcneype82um50ynhxgrwdajx283qfwdpl28qqmc78ymlvhmxcsywdk5wrjnj36jryg488qwlrnzyjczlqs85ck65ycmkdk92smwt9zuewdzfe7v4aavvaz5kgv9mkk63v3s0'
    assert.equal(detectPayoutAddressType(address), 'bolt12')
  })

  test('detects LNURL', () => {
    const address = 'lnurl1dp68gurn8ghj7mrww4exctnxd9shg6npvchxxmmd9akxuatjdskhqcte8a6r2'
    assert.equal(detectPayoutAddressType(address), 'lnurl')
  })

  test('detects LNURL case insensitive', () => {
    const address = 'LNURL1DP68GURN8GHJ7MRWW4EXCTNXD9SHG6NPVCHXXMMD9AKXUATJDSKHQCTE8A6R2'
    assert.equal(detectPayoutAddressType(address), 'lnurl')
  })

  test('detects Lightning Address', () => {
    const address = 'user@getalby.com'
    assert.equal(detectPayoutAddressType(address), 'lightning_address')
  })

  test('detects Lightning Address with subdomain', () => {
    const address = 'user@pay.getalby.com'
    assert.equal(detectPayoutAddressType(address), 'lightning_address')
  })

  test('detects BIP-353 with bitcoin symbol', () => {
    const address = '₿user@domain.com'
    assert.equal(detectPayoutAddressType(address), 'bip353')
  })

  test('detects Bolt11 mainnet invoice', () => {
    const address = 'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52dl8hyjkpnde3uvj8kszz85yxujfp8x59pddtpl6jv'
    assert.equal(detectPayoutAddressType(address), 'bolt11')
  })

  test('detects Bolt11 testnet invoice', () => {
    const address = 'lntb1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6'
    assert.equal(detectPayoutAddressType(address), 'bolt11')
  })

  test('detects Bolt11 signet invoice', () => {
    const address = 'lnbs1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'
    assert.equal(detectPayoutAddressType(address), 'bolt11')
  })

  test('returns null for unknown format', () => {
    assert.equal(detectPayoutAddressType('random-string'), null)
    assert.equal(detectPayoutAddressType(''), null)
    assert.equal(detectPayoutAddressType('user@'), null)
    assert.equal(detectPayoutAddressType('@domain.com'), null)
  })
})

describe('getPayoutConfig', () => {
  test('returns null when no env vars set', () => {
    const config = getPayoutConfig()
    assert.equal(config.address, null)
    assert.equal(config.isLegacy, false)
  })

  test('returns PAYOUT_ADDRESS when set with Bolt12', () => {
    process.env.PAYOUT_ADDRESS = 'lno1pg257enxv4ezqcneype82um50ynhxgrwdajx283qfwdpl28qqmc78ymlvhmxcsywdk5wrjnj36jryg488qwlrnzyjczlqs85ck65ycmkdk92smwt9zuewdzfe7v4aavvaz5kgv9mkk63v3s0'
    const config = getPayoutConfig()
    assert.equal(config.address?.type, 'bolt12')
    assert.equal(config.isLegacy, false)
  })

  test('returns PAYOUT_ADDRESS when set with Lightning Address', () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com'
    const config = getPayoutConfig()
    assert.equal(config.address?.type, 'lightning_address')
    assert.equal(config.isLegacy, false)
  })

  test('PAYOUT_ADDRESS takes priority over legacy env vars', () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com'
    process.env.WITHDRAWAL_BOLT_12 = 'lno1someotheroffer'
    const config = getPayoutConfig()
    assert.equal(config.address?.address, 'user@getalby.com')
    assert.equal(config.address?.type, 'lightning_address')
    assert.equal(config.isLegacy, false)
  })

  test('falls back to WITHDRAWAL_BOLT_12 when PAYOUT_ADDRESS not set', () => {
    process.env.WITHDRAWAL_BOLT_12 = 'lno1pg257enxv4ezq'
    const config = getPayoutConfig()
    assert.equal(config.address?.address, 'lno1pg257enxv4ezq')
    assert.equal(config.address?.type, 'bolt12')
    assert.equal(config.isLegacy, true)
    assert.equal(config.legacyEnvVar, 'WITHDRAWAL_BOLT_12')
  })

  test('falls back to WITHDRAWAL_LNURL when higher priority not set', () => {
    process.env.WITHDRAWAL_LNURL = 'lnurl1dp68gurn8ghj7mrww4exc'
    const config = getPayoutConfig()
    assert.equal(config.address?.address, 'lnurl1dp68gurn8ghj7mrww4exc')
    assert.equal(config.address?.type, 'lnurl')
    assert.equal(config.isLegacy, true)
    assert.equal(config.legacyEnvVar, 'WITHDRAWAL_LNURL')
  })

  test('WITHDRAWAL_LNURL with Lightning Address format detects correctly', () => {
    process.env.WITHDRAWAL_LNURL = 'user@domain.com'
    const config = getPayoutConfig()
    assert.equal(config.address?.address, 'user@domain.com')
    assert.equal(config.address?.type, 'lightning_address')
    assert.equal(config.isLegacy, true)
  })

  test('falls back to WITHDRAWAL_BOLT_11 when higher priority not set', () => {
    process.env.WITHDRAWAL_BOLT_11 = 'lnbc1pvjluez...'
    const config = getPayoutConfig()
    assert.equal(config.address?.address, 'lnbc1pvjluez...')
    assert.equal(config.address?.type, 'bolt11')
    assert.equal(config.isLegacy, true)
    assert.equal(config.legacyEnvVar, 'WITHDRAWAL_BOLT_11')
  })
})

describe('getPayoutAddressForType', () => {
  test('returns null when no matching address', () => {
    assert.equal(getPayoutAddressForType('bolt12'), null)
  })

  test('returns address when PAYOUT_ADDRESS matches type', () => {
    process.env.PAYOUT_ADDRESS = 'lno1pg257enxv4ezq'
    assert.equal(getPayoutAddressForType('bolt12'), 'lno1pg257enxv4ezq')
  })

  test('returns null when PAYOUT_ADDRESS type does not match', () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com'
    assert.equal(getPayoutAddressForType('bolt12'), null)
  })

  test('returns Lightning Address for lnurl type', () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com'
    assert.equal(getPayoutAddressForType('lnurl'), 'user@getalby.com')
  })

  test('returns BIP-353 address for lnurl type', () => {
    process.env.PAYOUT_ADDRESS = '₿user@domain.com'
    assert.equal(getPayoutAddressForType('lnurl'), '₿user@domain.com')
  })

  test('falls back to WITHDRAWAL_BOLT_12 when PAYOUT_ADDRESS is different type', () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com' // lightning_address
    process.env.WITHDRAWAL_BOLT_12 = 'lno1legacyoffer'
    assert.equal(getPayoutAddressForType('bolt12'), 'lno1legacyoffer')
  })

  test('falls back to WITHDRAWAL_BOLT_11 when PAYOUT_ADDRESS is different type', () => {
    process.env.PAYOUT_ADDRESS = 'lno1pg257enxv4ezq' // bolt12
    process.env.WITHDRAWAL_BOLT_11 = 'lnbc1legacyinvoice'
    assert.equal(getPayoutAddressForType('bolt11'), 'lnbc1legacyinvoice')
  })

  test('falls back to WITHDRAWAL_LNURL when PAYOUT_ADDRESS is different type', () => {
    process.env.PAYOUT_ADDRESS = 'lno1pg257enxv4ezq' // bolt12
    process.env.WITHDRAWAL_LNURL = 'lnurl1legacy'
    assert.equal(getPayoutAddressForType('lnurl'), 'lnurl1legacy')
  })

  test('returns null when PAYOUT_ADDRESS type differs and no legacy var set', () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com' // lightning_address
    // No WITHDRAWAL_BOLT_12 set
    assert.equal(getPayoutAddressForType('bolt12'), null)
  })
})

describe('hasPayoutAddress', () => {
  test('returns false when no address configured', () => {
    assert.equal(hasPayoutAddress(), false)
  })

  test('returns true when PAYOUT_ADDRESS is set', () => {
    process.env.PAYOUT_ADDRESS = 'user@getalby.com'
    assert.equal(hasPayoutAddress(), true)
  })

  test('returns true when legacy env var is set', () => {
    process.env.WITHDRAWAL_BOLT_12 = 'lno1test'
    assert.equal(hasPayoutAddress(), true)
  })
})
