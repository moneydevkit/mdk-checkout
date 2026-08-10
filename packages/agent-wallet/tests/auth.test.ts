import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as http from 'node:http'
import * as net from 'node:net'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// config.ts resolves ~/.mdk-wallet at import time, so HOME must be redirected
// before it loads. Hence the dynamic imports below.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mdk-wallet-auth-'))
const realHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome

const { ensureApiToken, getTokenFile } = await import('../src/config.js')
const { WalletServer } = await import('../src/server.js')

const token = ensureApiToken()
let port = 0
let server: InstanceType<typeof WalletServer>

before(async () => {
  server = new WalletServer(
    { mnemonic: 'test mnemonic not used', network: 'signet', walletId: 'test-wallet' },
    token,
  )
  // listen() only binds the HTTP API: node stays null, so anything that gets
  // past the auth gate answers 500 NODE_NOT_RUNNING. That 500 is the signal
  // that a request reached a handler - the shape the disclosure exploited.
  port = await server.listen(0)
})

after(() => {
  server.stop()
  fs.rmSync(fakeHome, { recursive: true, force: true })
  process.env.HOME = realHome.HOME
  process.env.USERPROFILE = realHome.USERPROFILE
})

/**
 * Send a hand-written request over a raw socket, for the shapes http.request
 * refuses to produce: HTTP/1.0 with no Host, duplicate headers, absolute-form
 * targets. Returns the status line plus the response body.
 */
function rawSocket(request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(request))
    let data = ''
    socket.on('data', (chunk) => (data += chunk))
    socket.on('end', () => resolve(data))
    socket.on('error', reject)
    socket.setTimeout(5000, () => {
      socket.destroy()
      resolve(data)
    })
  })
}

interface Reply {
  status: number
  code?: string
}

/**
 * Raw http.request rather than fetch: the tests need to set Host and Origin,
 * and to send a body with a content type fetch would not allow.
 */
function call(
  method: string,
  reqPath: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: reqPath, headers }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        let code: string | undefined
        try {
          code = JSON.parse(data)?.error?.code
        } catch {
          code = undefined
        }
        resolve({ status: res.statusCode ?? 0, code })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const bearer = { authorization: `Bearer ${token}` }

const ROUTES: Array<[string, string, string?]> = [
  ['GET', '/health'],
  ['GET', '/balance'],
  ['GET', '/payments'],
  ['GET', '/payment/abc'],
  ['POST', '/receive', '{"amount_sats":10}'],
  ['POST', '/receive-bolt12', '{}'],
  ['POST', '/send', '{"destination":"lnbc1attacker"}'],
]

test('every route rejects a request with no token', async () => {
  for (const [method, route, body] of ROUTES) {
    const res = await call(method, route, {}, body)
    assert.equal(res.status, 401, `${method} ${route} must be 401`)
    assert.equal(res.code, 'UNAUTHORIZED')
  }
})

test('the disclosed drive-by is rejected before the pay path', async () => {
  // Verbatim from the report: text/plain (a CORS "simple request", so no
  // preflight) plus a hostile Origin, no credentials.
  const res = await call(
    'POST',
    '/send',
    { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://evil.example' },
    '{"destination":"lntbs1_attacker_invoice"}',
  )
  assert.equal(res.status, 401)
})

test('browser fetch markers are rejected even when the token is correct', async () => {
  // Defence in depth: if the token ever leaks into a page, the page still loses.
  for (const marker of [
    { origin: 'https://evil.example' },
    { origin: 'null' }, // sandboxed iframe / file:// page
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-origin' },
    { 'sec-fetch-site': 'none' }, // typed into the address bar
  ]) {
    const res = await call('GET', '/balance', { ...bearer, ...marker })
    assert.equal(res.status, 401, `${JSON.stringify(marker)} must be 401`)
  }
})

test('sec-fetch-mode is not a browser marker: Node fetch sends it', async () => {
  // Gotcha: undici sets `sec-fetch-mode: cors` on every fetch(), so treating it
  // as browser-only 401s the CLI itself. Only origin/sec-fetch-site may gate.
  const res = await call('GET', '/balance', { ...bearer, 'sec-fetch-mode': 'cors' })
  assert.equal(res.status, 500)
  assert.equal(res.code, 'NODE_NOT_RUNNING')
})

test('the real WalletClient gets past the gate', async () => {
  // Guards against a future undici adding headers the gate rejects, which would
  // 401 every CLI command. Reaching the handler (NODE_NOT_RUNNING) is the pass.
  const { WalletClient } = await import('../src/client.js')
  const client = new WalletClient(port, token)

  assert.deepEqual(await client.health(), { status: 'ok', nodeRunning: false, pid: process.pid })
  await assert.rejects(client.balance(), /Node not running/)
  await assert.rejects(client.send('lnbc1test'), /Node not running/)
})

test('a token does not license a browser POST /send either', async () => {
  // The money route, not just a read: a page holding the token still cannot pay.
  const res = await call(
    'POST',
    '/send',
    { ...bearer, origin: 'https://evil.example', 'content-type': 'application/json' },
    '{"destination":"lnbc1attacker"}',
  )
  assert.equal(res.status, 401)
  assert.equal(res.code, 'UNAUTHORIZED')
})

test('CORS preflight gets no permission to send', async () => {
  // A 200 with Access-Control-* headers here would re-open the drive-by for
  // non-simple requests. 401 with no CORS headers is the only safe answer.
  const raw = await rawSocket(
    `OPTIONS /send HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: https://evil.example\r\n` +
      'Access-Control-Request-Method: POST\r\nConnection: close\r\n\r\n',
  )
  assert.match(raw, /^HTTP\/1\.1 401 /)
  assert.doesNotMatch(raw.toLowerCase(), /access-control-allow/)
})

test('TRACE and unknown verbs are gated too', async () => {
  for (const method of ['TRACE', 'PUT', 'DELETE', 'PATCH']) {
    const res = await call(method, '/send')
    assert.equal(res.status, 401, `${method} must be 401`)
  }
})

test('a request with no Host header is rejected', async () => {
  // HTTP/1.0 permits omitting Host, so the guard cannot assume it is present.
  const raw = await rawSocket(
    `GET /balance HTTP/1.0\r\nAuthorization: Bearer ${token}\r\n\r\n`,
  )
  assert.match(raw, /^HTTP\/1\.[01] 401 /)
})

test('a smuggled second Host header cannot reach a handler', async () => {
  // Node does NOT reject a duplicate Host: it keeps the first and hands the
  // request on, so this returned 200 until the guard counted rawHeaders. Pin the
  // status - "not 2xx" would be satisfied by 500 NODE_NOT_RUNNING, which per the
  // fixture above is proof that a handler DID run.
  for (const hosts of [
    `Host: 127.0.0.1:${port}\r\nHost: evil.example`,
    `Host: evil.example\r\nHost: 127.0.0.1:${port}`,
  ]) {
    const raw = await rawSocket(
      `GET /balance HTTP/1.1\r\n${hosts}\r\nAuthorization: Bearer ${token}\r\nConnection: close\r\n\r\n`,
    )
    assert.match(raw, /^HTTP\/1\.1 401 /, `duplicate Host must be 401: ${hosts}`)
  }
})

test('an absolute-form target does not skip the Host check', async () => {
  // GET http://evil.example/balance with a loopback Host, and the reverse.
  const spoofedTarget = await rawSocket(
    `GET http://evil.example/balance HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
      'Connection: close\r\n\r\n',
  )
  assert.match(spoofedTarget, /^HTTP\/1\.1 401 /)

  const spoofedHost = await rawSocket(
    `GET http://127.0.0.1:${port}/balance HTTP/1.1\r\nHost: evil.example\r\n` +
      `Authorization: Bearer ${token}\r\nConnection: close\r\n\r\n`,
  )
  assert.match(spoofedHost, /^HTTP\/1\.1 401 /)
})

test('a malformed request target cannot take the daemon down', async () => {
  // handleRequest's promise is dropped by the http callback, so anything that
  // throws synchronously in it (a URL parse, the auth check) would surface as an
  // unhandled rejection and kill a daemon holding channel state.
  for (const target of ['/\\', '//evil.example/balance', '/%', '*', 'http://[/balance']) {
    await rawSocket(
      `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${token}\r\n` +
        'Connection: close\r\n\r\n',
    )
  }

  // Still serving afterwards: that is the assertion.
  assert.equal((await call('GET', '/health', bearer)).status, 200)
})

test('an oversized body is refused instead of buffered', async () => {
  const res = await call(
    'POST',
    '/send',
    { ...bearer, 'content-type': 'application/json' },
    JSON.stringify({ destination: 'lnbc1' + 'x'.repeat(80 * 1024) }),
  )
  assert.equal(res.status, 413)
  assert.equal(res.code, 'BODY_TOO_LARGE')
})

test('a non-loopback Host is rejected (DNS rebinding)', async () => {
  for (const host of ['evil.example', 'evil.example:3456', '192.168.1.10:3456', 'wallet.local']) {
    const res = await call('GET', '/balance', { ...bearer, host })
    assert.equal(res.status, 401, `Host: ${host} must be 401`)
  }
})

test('loopback Host spellings are accepted', async () => {
  // Numeric aliases are accepted because they can only mean loopback; no DNS
  // record can aim them elsewhere. The connection is IPv4 in every case here -
  // the daemon binds IPv4 only, so `[::1]` is a header spelling, not a route.
  for (const host of ['127.0.0.1:3456', 'localhost:3456', 'localhost', '[::1]:3456', '127.1']) {
    const res = await call('GET', '/balance', { ...bearer, host })
    assert.equal(res.status, 500, `Host: ${host} must reach the handler`)
    assert.equal(res.code, 'NODE_NOT_RUNNING')
  }
})

test('wrong tokens are rejected, whatever their length', async () => {
  const wrongSameLength = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
  const candidates = [
    wrongSameLength, // equal length: exercises the constant-time compare
    'short', // shorter: timingSafeEqual would throw if length were unchecked
    token + 'extra', // longer
    '', // empty
  ]
  for (const candidate of candidates) {
    const res = await call('GET', '/balance', { authorization: `Bearer ${candidate}` })
    assert.equal(res.status, 401, `token ${JSON.stringify(candidate)} must be 401`)
  }
  // A raw token without the Bearer scheme is not a credential either.
  assert.equal((await call('GET', '/balance', { authorization: token })).status, 401)
})

test('the correct token reaches the handlers', async () => {
  assert.equal((await call('GET', '/health', bearer)).status, 200)

  const balance = await call('GET', '/balance', bearer)
  assert.equal(balance.status, 500)
  assert.equal(balance.code, 'NODE_NOT_RUNNING')

  const send = await call(
    'POST',
    '/send',
    { ...bearer, 'content-type': 'application/json' },
    '{"destination":"lnbc1test"}',
  )
  assert.equal(send.status, 500)
  assert.equal(send.code, 'NODE_NOT_RUNNING')

  assert.equal((await call('GET', '/nope', bearer)).status, 404)
})

test('ensureApiToken is idempotent and the file is owner-only', async () => {
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.equal(ensureApiToken(), token)

  const mode = fs.statSync(getTokenFile()).mode & 0o777
  assert.equal(mode, 0o600)
})

test('a corrupt token file is reported, never trusted or silently replaced', async () => {
  // "" must not become a master key, and a truncated file must not become a
  // short guessable one. Repair is deliberately not attempted: a running daemon
  // holds its token in memory, so minting a new one would 401 regardless.
  for (const corrupt of ['', '   \n', 'deadbeef', 'ZZZZ'.repeat(16), token.slice(0, 63)]) {
    fs.writeFileSync(getTokenFile(), corrupt, { mode: 0o600 })

    assert.throws(() => ensureApiToken(), /holds no valid API token/, `"${corrupt.slice(0, 12)}"`)
    // The bad file is left alone rather than raced over.
    assert.equal(fs.readFileSync(getTokenFile(), 'utf-8'), corrupt)
    // And the corrupt value never authenticates.
    assert.equal((await call('GET', '/balance', { authorization: `Bearer ${corrupt.trim()}` })).status, 401)
  }

  fs.writeFileSync(getTokenFile(), token, { mode: 0o600 })
})

test('a token file that is not a regular file is refused', async () => {
  const tokenFile = getTokenFile()
  const decoy = path.join(fakeHome, 'decoy.token')
  fs.writeFileSync(decoy, `${token}\n`)
  fs.rmSync(tokenFile)
  fs.symlinkSync(decoy, tokenFile)

  try {
    // Reading through a symlink would let anything that can plant one choose the
    // credential, and the 0600 repair would chmod someone else's file. O_NOFOLLOW
    // makes this ELOOP before any read happens.
    assert.throws(() => ensureApiToken(), /is a symlink|not a regular file/)
  } finally {
    // Restore even on failure: the later tests share this file.
    fs.rmSync(tokenFile)
    fs.writeFileSync(tokenFile, token, { mode: 0o600 })
  }
})

test('a trailing newline in the token file is tolerated', async () => {
  fs.writeFileSync(getTokenFile(), `  ${token}\n`, { mode: 0o600 })
  assert.equal(ensureApiToken(), token)
  assert.equal((await call('GET', '/balance', bearer)).status, 500)

  fs.writeFileSync(getTokenFile(), token, { mode: 0o600 })
})

test('a world-readable token file gets clamped back to 0600', async () => {
  fs.chmodSync(getTokenFile(), 0o644)
  assert.equal(ensureApiToken(), token, 'a valid token must survive the repair')
  assert.equal(fs.statSync(getTokenFile()).mode & 0o777, 0o600)
})

test('a group- or world-accessible config dir gets clamped back to 0700', async () => {
  // The mnemonic lives in this directory too. A loose mode lets another user
  // read the token or swap the file it is read from.
  const configDir = path.dirname(getTokenFile())
  fs.chmodSync(configDir, 0o755)
  ensureApiToken()
  assert.equal(fs.statSync(configDir).mode & 0o777, 0o700)
})

test('concurrent processes converge on one token', async () => {
  // The reason publication uses link() and not a plain create-then-write: the
  // CLI and the daemon it spawns both call ensureApiToken at the same moment,
  // and two different tokens means the CLI 401s against its own daemon.
  const raceHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mdk-wallet-race-'))
  const script = path.join(raceHome, 'race.mjs')
  const gate = path.join(raceHome, 'go')
  const configModule = new URL('../src/config.ts', import.meta.url).pathname
  const children = 8
  // Each child imports, announces itself, then spins on the gate. The parent
  // opens the gate only once all of them are ready, so they call
  // ensureApiToken() within microseconds instead of drifting apart across
  // module-load time (which is most of a child's lifetime). A fixed sleep here
  // would let a slow child arrive after the token was already published and
  // silently skip the linkSync() EEXIST path this test exists to cover.
  fs.writeFileSync(
    script,
    `import * as fs from 'node:fs'\n` +
      `const { ensureApiToken } = await import(${JSON.stringify(configModule)})\n` +
      `fs.writeFileSync(process.env.READY_FILE, '')\n` +
      `while (!fs.existsSync(${JSON.stringify(gate)})) {}\n` +
      'process.stdout.write(ensureApiToken())\n',
  )

  // execFile, not execFileSync: the point is that these processes overlap.
  const run = promisify(execFile)
  const readyDir = path.join(raceHome, 'ready')
  fs.mkdirSync(readyDir)
  const running = Array.from({ length: children }, (_, i) =>
    run(process.execPath, ['--import', 'tsx', script], {
      env: {
        ...process.env,
        HOME: raceHome,
        USERPROFILE: raceHome,
        READY_FILE: path.join(readyDir, String(i)),
      },
      encoding: 'utf-8',
    }),
  )

  const deadline = Date.now() + 60_000
  while (fs.readdirSync(readyDir).length < children) {
    assert.ok(Date.now() < deadline, 'children never reached the barrier')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  fs.writeFileSync(gate, '')

  const tokens = (await Promise.all(running)).map((r) => r.stdout)

  assert.equal(new Set(tokens).size, 1, `processes disagreed: ${JSON.stringify(tokens)}`)
  assert.match(tokens[0], /^[0-9a-f]{64}$/)
  // The token every process returned is the one on disk, and no loser left a
  // temp file (each holds a distinct secret) behind.
  assert.equal(fs.readFileSync(path.join(raceHome, '.mdk-wallet', 'auth.token'), 'utf-8'), tokens[0])
  assert.deepEqual(fs.readdirSync(path.join(raceHome, '.mdk-wallet')).sort(), ['auth.token'])
  // What this proves: 8 processes released together agree with each other and
  // with the file, and none leaves a temp secret behind. What it does NOT prove
  // is that all 7 losers went through linkSync's EEXIST branch - the barrier
  // releases them together but cannot pin them to that exact instruction.
  assert.equal(fs.readdirSync(readyDir).length, children)

  fs.rmSync(raceHome, { recursive: true, force: true })
})
