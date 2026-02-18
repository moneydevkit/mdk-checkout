import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.MDK_ACCESS_TOKEN = 'test-token'
  process.env.MDK_MNEMONIC = TEST_MNEMONIC
  // Clear network override so it defaults to mainnet
  delete process.env.MDK_NETWORK
})

afterEach(() => {
  process.env = { ...originalEnv }
})

// Native module is loaded lazily, so the import itself is safe.
// Tests that call deriveNodeIdFromConfig will fail if the native binary isn't built.
// eslint-disable-next-line @typescript-eslint/no-require-imports
let deriveNodeIdFromConfig: typeof import('../src/mdk').deriveNodeIdFromConfig

let nativeAvailable = true
try {
  ;({ deriveNodeIdFromConfig } = await import('../src/mdk'))
} catch {
  nativeAvailable = false
}

describe('deriveNodeIdFromConfig', { skip: !nativeAvailable && 'native lightning-js module not available' }, () => {
  it('returns a 66-char hex compressed public key', () => {
    const nodeId = deriveNodeIdFromConfig()
    // Compressed public key: 02 or 03 prefix + 64 hex chars = 66 chars
    assert.match(nodeId, /^0[23][0-9a-f]{64}$/)
  })

  it('is deterministic — same mnemonic always produces the same node ID', () => {
    const first = deriveNodeIdFromConfig()
    const second = deriveNodeIdFromConfig()
    assert.equal(first, second)
  })

  it('produces the same node ID regardless of network', () => {
    const mainnetId = deriveNodeIdFromConfig()

    process.env.MDK_NETWORK = 'signet'
    const signetId = deriveNodeIdFromConfig()

    // BIP32 master key derivation produces identical private key bytes
    // regardless of network — network only affects serialization format
    assert.equal(mainnetId, signetId)
  })

  it('produces different node IDs for different mnemonics', () => {
    const firstId = deriveNodeIdFromConfig()

    process.env.MDK_MNEMONIC =
      'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'
    const secondId = deriveNodeIdFromConfig()

    assert.notEqual(firstId, secondId)
  })

  it('throws when MDK_ACCESS_TOKEN is missing', () => {
    delete process.env.MDK_ACCESS_TOKEN
    assert.throws(() => deriveNodeIdFromConfig(), /MDK_ACCESS_TOKEN/)
  })

  it('throws when MDK_MNEMONIC is missing', () => {
    delete process.env.MDK_MNEMONIC
    assert.throws(() => deriveNodeIdFromConfig(), /MDK_MNEMONIC/)
  })

  it('throws on invalid mnemonic', () => {
    process.env.MDK_MNEMONIC = 'not a valid mnemonic phrase at all'
    assert.throws(() => deriveNodeIdFromConfig())
  })
})
