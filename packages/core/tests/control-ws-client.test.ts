import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { afterEach, test } from 'node:test'

import { WebSocket, WebSocketServer } from 'ws'

import { CmdQueue, EventQueue, type SessionState } from '../src/control/queue'
import { connectControl } from '../src/control/ws-client'

type StubServer = {
  url: string
  http: Server
  wss: WebSocketServer
  close: () => Promise<void>
  // recorded by the stub so tests can assert
  receivedAuth?: string
  // hook the test sets to control handshake
  onConnect?: (ws: WebSocket, authHeader: string | undefined) => void
}

async function startStub(): Promise<StubServer> {
  const http = createServer()
  const wss = new WebSocketServer({ noServer: true })
  const stub: StubServer = {
    url: '',
    http,
    wss,
    close: () =>
      new Promise<void>((resolve) => {
        wss.close(() => http.close(() => resolve()))
      }),
  }
  http.on('upgrade', (req, socket, head) => {
    const auth = req.headers.authorization
    stub.receivedAuth = auth
    wss.handleUpgrade(req, socket, head, (ws) => {
      stub.onConnect?.(ws, auth)
    })
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const addr = http.address()
  if (!addr || typeof addr === 'string') throw new Error('address missing')
  stub.url = `ws://127.0.0.1:${addr.port}/control`
  return stub
}

const stubs: StubServer[] = []
afterEach(async () => {
  while (stubs.length) {
    const s = stubs.pop()
    if (s) await s.close()
  }
})

function makeOpts(stub: StubServer, overrides: Partial<{
  accessToken: string
  leaseTimeoutMs: number
  withdrawalDestination: string | undefined
}> = {}) {
  const queue = new CmdQueue()
  const eventQueue = new EventQueue()
  const sessionState: SessionState = { nodeReady: false, draining: false }
  return {
    options: {
      url: stub.url,
      accessToken: overrides.accessToken ?? 'tok-abc',
      queue,
      eventQueue,
      sessionState,
      env: { WITHDRAWAL_DESTINATION: overrides.withdrawalDestination ?? 'lnurl-test' },
      leaseTimeoutMs: overrides.leaseTimeoutMs ?? 5000,
    },
    queue,
    eventQueue,
    sessionState,
  }
}

test('sends Authorization: Bearer header on upgrade', async () => {
  const stub = await startStub()
  stubs.push(stub)
  stub.onConnect = (ws) => {
    ws.send(JSON.stringify({ type: 'lease.granted' }))
  }
  const { options } = makeOpts(stub, { accessToken: 'sekrit-key' })
  const result = await connectControl(options)
  assert.equal(result.status, 'ok')
  assert.equal(stub.receivedAuth, 'Bearer sekrit-key')
  if (result.status === 'ok') await result.client.close(0)
})

test('resolves to lease-denied when server closes with 4001 during handshake', async () => {
  const stub = await startStub()
  stubs.push(stub)
  stub.onConnect = (ws) => {
    ws.close(4001, 'lease held')
  }
  const { options } = makeOpts(stub)
  const result = await connectControl(options)
  assert.equal(result.status, 'lease-denied')
  if (result.status === 'lease-denied') {
    assert.equal(result.code, 4001)
    assert.equal(result.reason, 'lease held')
  }
})

test('rejects on lease handshake timeout', async () => {
  const stub = await startStub()
  stubs.push(stub)
  stub.onConnect = () => {
    // never send lease.granted
  }
  const { options } = makeOpts(stub, { leaseTimeoutMs: 100 })
  await assert.rejects(connectControl(options), /lease.granted not received within 100ms/)
})

test('after lease granted, RPC handler is attached and queue is reachable', async () => {
  const stub = await startStub()
  stubs.push(stub)
  stub.onConnect = (ws) => {
    ws.send(JSON.stringify({ type: 'lease.granted' }))
  }
  const { options, queue, sessionState } = makeOpts(stub)
  const result = await connectControl(options)
  assert.equal(result.status, 'ok')
  if (result.status !== 'ok') return

  // Pretend node is ready
  sessionState.nodeReady = true
  assert.equal(queue.size, 0)
  assert.equal(result.client.closed, false)

  await result.client.close(0)
})

test('client.close is idempotent and signals closed=true', async () => {
  const stub = await startStub()
  stubs.push(stub)
  stub.onConnect = (ws) => {
    ws.send(JSON.stringify({ type: 'lease.granted' }))
  }
  const { options } = makeOpts(stub)
  const result = await connectControl(options)
  assert.equal(result.status, 'ok')
  if (result.status !== 'ok') return
  assert.equal(result.client.closed, false)
  await result.client.close(0)
  assert.equal(result.client.closed, true)
  await result.client.close(0)
  assert.equal(result.client.closed, true)
})

test('startDraining flips sessionState.draining', async () => {
  const stub = await startStub()
  stubs.push(stub)
  stub.onConnect = (ws) => {
    ws.send(JSON.stringify({ type: 'lease.granted' }))
  }
  const { options, sessionState } = makeOpts(stub)
  const result = await connectControl(options)
  assert.equal(result.status, 'ok')
  if (result.status !== 'ok') return
  assert.equal(sessionState.draining, false)
  result.client.startDraining()
  assert.equal(sessionState.draining, true)
  await result.client.close(0)
})

test('external server-initiated close after lease flips client.closed', async () => {
  const stub = await startStub()
  stubs.push(stub)
  let serverWs: WebSocket | undefined
  stub.onConnect = (ws) => {
    serverWs = ws
    ws.send(JSON.stringify({ type: 'lease.granted' }))
  }
  const { options } = makeOpts(stub)
  const result = await connectControl(options)
  assert.equal(result.status, 'ok')
  if (result.status !== 'ok') return
  assert.equal(result.client.closed, false)
  serverWs?.close()
  // Wait for the close event to propagate
  for (let i = 0; i < 20 && !result.client.closed; i++) {
    await new Promise((r) => setTimeout(r, 25))
  }
  assert.equal(result.client.closed, true)
})
