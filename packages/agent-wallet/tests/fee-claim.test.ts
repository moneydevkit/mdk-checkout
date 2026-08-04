import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { AddressInfo } from 'node:net'

import { cachedClaimFor, claimNodeId, fetchFeeClaim } from '../src/fee-claim'
import { saveFeeClaim, type PartialConfig } from '../src/config'

const NODE_ID = '0311234b076cb64b62a80d2b6d15ad9a51a659fa4283be9e811a5eecebdd8bd7bd'

/**
 * Real signed claims from moneydevkit.com's cross-impl test vectors
 * (lib/fee-claim/encode.test.ts): a 0.5% grant bound to NODE_ID, and a
 * zero-fee grant bound to a different node.
 */
const CLAIM_FOR_NODE_ID =
  '87004300414000010102210311234b076cb64b62a80d2b6d15ad9a51a659fa4283be9e811a5eecebdd8bd7bd041800160414000800000000000013880208000000000000000002406258adf6152feac20889a75ad06f340e1fc15bc034993876865f4fdcbadfde60644ab1a97f58b70b3369eb48c997b2ac5453cdaffa102fbb5727d96bdffe3803'
const CLAIM_FOR_OTHER_NODE =
  '73002f002d2c0001010221034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa04040002020002408f3868ca716c39d580d8b54c8d852c22f0f1ea4a174ba13ad571e37fd182aa60e82a88c00225a3f61112804cf1e7c41bd39dbdc7fcb78e779b78423fff47d964'

describe('fetchFeeClaim', () => {
  let server: http.Server
  let url: string
  // Each test assigns the handler the stub server should answer with.
  let handler: http.RequestListener

  before(async () => {
    server = http.createServer((req, res) => handler(req, res))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mint-fee-claim`
  })

  after(() => server.close())

  it('returns the claim on 200 and posts the nodeId', async () => {
    let receivedBody = ''
    handler = (req, res) => {
      req.on('data', (c) => (receivedBody += c))
      req.on('end', () => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ claim: CLAIM_FOR_NODE_ID }))
      })
    }
    assert.equal(await fetchFeeClaim(NODE_ID, url), CLAIM_FOR_NODE_ID)
    assert.deepEqual(JSON.parse(receivedBody), { nodeId: NODE_ID })
  })

  it('rejects a claim bound to a different node', async () => {
    handler = (_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ claim: CLAIM_FOR_OTHER_NODE }))
    }
    assert.equal(await fetchFeeClaim(NODE_ID, url), null)
  })

  it('rejects hex that is not a well-formed claim instead of caching it forever', async () => {
    for (const claim of ['deadbeef', CLAIM_FOR_NODE_ID.slice(0, -8), CLAIM_FOR_NODE_ID + '00']) {
      handler = (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ claim }))
      }
      assert.equal(await fetchFeeClaim(NODE_ID, url), null, `claim ${claim.slice(0, 16)}…`)
    }
  })

  it('returns null on refusal statuses', async () => {
    for (const status of [400, 403, 429, 503]) {
      handler = (_req, res) => {
        res.statusCode = status
        res.end(JSON.stringify({ error: 'no' }))
      }
      assert.equal(await fetchFeeClaim(NODE_ID, url), null, `status ${status}`)
    }
  })

  it('returns null on a malformed claim', async () => {
    for (const body of ['{"claim":"NOT HEX"}', '{"claim":42}', '{}', 'not json']) {
      handler = (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(body)
      }
      assert.equal(await fetchFeeClaim(NODE_ID, url), null, `body ${body}`)
    }
  })

  it('returns null on timeout instead of hanging startup', async () => {
    handler = () => {} // never respond
    assert.equal(await fetchFeeClaim(NODE_ID, url, 100), null)
  })

  it('returns null when the endpoint is unreachable', async () => {
    assert.equal(await fetchFeeClaim(NODE_ID, 'http://127.0.0.1:1/api/mint-fee-claim', 500), null)
  })
})

describe('saveFeeClaim', () => {
  let tmpDir: string
  let configFile: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdk-wallet-test-'))
    configFile = path.join(tmpDir, 'config.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('patches feeClaim and its node binding into the raw file without touching other fields', () => {
    const original: PartialConfig = { mnemonic: 'a b c', network: 'signet', walletId: 'w-1' }
    fs.writeFileSync(configFile, JSON.stringify(original))
    assert.equal(saveFeeClaim('deadbeef', NODE_ID, configFile), true)
    const after = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
    assert.deepEqual(after, { ...original, feeClaim: 'deadbeef', feeClaimNodeId: NODE_ID })
  })

  it('reports failure when the file is missing instead of throwing', () => {
    assert.equal(saveFeeClaim('deadbeef', NODE_ID, path.join(tmpDir, 'nope.json')), false)
  })
})

describe('claimNodeId', () => {
  it('extracts the bound node id from real claims', () => {
    assert.equal(claimNodeId(CLAIM_FOR_NODE_ID), NODE_ID)
    assert.equal(
      claimNodeId(CLAIM_FOR_OTHER_NODE),
      '034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa',
    )
  })

  it('rejects structural corruption anywhere in the claim', () => {
    const flip = (hex: string, at: number) => {
      const nibble = ((parseInt(hex[at], 16) + 1) % 16).toString(16)
      return hex.slice(0, at) + nibble + hex.slice(at + 1)
    }
    assert.equal(claimNodeId(''), null)
    assert.equal(claimNodeId('zz'), null)
    assert.equal(claimNodeId('deadbeef'), null)
    assert.equal(claimNodeId(CLAIM_FOR_NODE_ID.slice(0, -8)), null) // truncated sig
    assert.equal(claimNodeId(CLAIM_FOR_NODE_ID + '00'), null) // trailing bytes
    assert.equal(claimNodeId(flip(CLAIM_FOR_NODE_ID, 0)), null) // outer length
    assert.equal(claimNodeId(flip(CLAIM_FOR_NODE_ID, 13)), null) // scheme byte
    // Corrupting the signature bytes still parses - signature validity is
    // deliberately the LSP's job, not the wallet's.
    assert.equal(claimNodeId(flip(CLAIM_FOR_NODE_ID, CLAIM_FOR_NODE_ID.length - 1)), NODE_ID)
  })

  it('rejects an unknown FeeTier variant the verifier would refuse', () => {
    // chars 96-97 are the FeeTier variant tag (0x04 = Custom) inside the
    // nested policy record; anchor the offset before mutating it.
    assert.equal(CLAIM_FOR_NODE_ID.slice(96, 98), '04')
    assert.equal(claimNodeId(CLAIM_FOR_NODE_ID.slice(0, 96) + '06' + CLAIM_FOR_NODE_ID.slice(98)), null)
  })

  it('rejects non-canonical BigSize encodings like LDK does', () => {
    // Re-encode the signature record length 0x40 as the non-minimal
    // three-byte form fd0040 and grow the outer length 0x87 -> 0x89.
    assert.equal(CLAIM_FOR_NODE_ID.slice(0, 2), '87')
    assert.equal(CLAIM_FOR_NODE_ID.slice(140, 144), '0240')
    const nonCanonical =
      '89' + CLAIM_FOR_NODE_ID.slice(2, 142) + 'fd0040' + CLAIM_FOR_NODE_ID.slice(144)
    assert.equal(claimNodeId(nonCanonical), null)
  })
})

describe('cachedClaimFor', () => {
  it('returns the claim only when its node binding matches', () => {
    const config = { feeClaim: 'deadbeef', feeClaimNodeId: NODE_ID }
    assert.equal(cachedClaimFor(config, NODE_ID), 'deadbeef')
    assert.equal(cachedClaimFor(config, '02' + '11'.repeat(32)), null)
  })

  it('treats a claim without a node binding as absent', () => {
    assert.equal(cachedClaimFor({ feeClaim: 'deadbeef' }, NODE_ID), null)
    assert.equal(cachedClaimFor({}, NODE_ID), null)
  })
})
