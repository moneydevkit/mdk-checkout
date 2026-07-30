import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { AddressInfo } from 'node:net'

import { cachedClaimFor, fetchFeeClaim } from '../src/fee-claim'
import { saveFeeClaim, type PartialConfig } from '../src/config'

const NODE_ID = '0311234b076cb64b62a80d2b6d15ad9a51a659fa4283be9e811a5eecebdd8bd7bd'

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
        res.end(JSON.stringify({ claim: 'deadbeef' }))
      })
    }
    assert.equal(await fetchFeeClaim(NODE_ID, url), 'deadbeef')
    assert.deepEqual(JSON.parse(receivedBody), { nodeId: NODE_ID })
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
