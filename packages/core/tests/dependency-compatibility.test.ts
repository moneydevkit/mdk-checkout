import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { zodResolver } from '@hookform/resolvers/zod'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import type { RouterClient } from '@orpc/server'
import { WebSocketServer } from 'ws'
import { z } from 'zod'

import { handleCreateCheckout } from '../src/handlers/checkout'
import { handleGetCustomer } from '../src/handlers/customer'
import { nodeControlRouter } from '../src/control/handlers'
import { CmdQueue, EventQueue } from '../src/control/queue'
import { connectControl } from '../src/control/ws-client'

test('form resolver returns field errors for invalid Zod email input', async () => {
  const resolver = zodResolver(z.object({ email: z.string().email() }))
  const result = await resolver({ email: 'invalid' }, undefined, {
    fields: {}, shouldUseNativeValidation: false,
  })
  assert.equal(typeof result.errors.email?.message, 'string')
  assert.deepEqual(result.values, {})
})

test('customer handler returns 400 for an invalid identifier using its actual contract schema', async () => {
  const response = await handleGetCustomer(new Request('http://localhost/api/mdk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 123 }),
  }))

  assert.equal(response.status, 400)
  assert.equal(typeof (await response.json()).error, 'string')
})

test('checkout handler validates currency and metadata before calling the provider', async () => {
  const invalidCurrency = await handleCreateCheckout(new Request('http://localhost/api/mdk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ params: {
      type: 'AMOUNT', currency: 'INVALID', amount: 1234,
      metadata: { reference: 'attempt_123' },
    } }),
  }))

  assert.equal(invalidCurrency.status, 400)
  const currencyBody = await invalidCurrency.json()
  assert.deepEqual(currencyBody.details.map((issue: { path: unknown[] }) => issue.path), [['params', 'currency']])

  const invalidMetadata = await handleCreateCheckout(new Request('http://localhost/api/mdk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ params: {
      type: 'AMOUNT', currency: 'USD', amount: 1234, metadata: { reference: 123 },
    } }),
  }))

  assert.equal(invalidMetadata.status, 400)
  const metadataBody = await invalidMetadata.json()
  assert.deepEqual(metadataBody.details.map((issue: { path: unknown[] }) => issue.path), [['params', 'metadata', 'reference']])
})

test('SDK route loads and protects callback handler with shared-secret authentication', async () => {
  const route = await import('../src/route')
  const previous = process.env.MDK_ACCESS_TOKEN
  process.env.MDK_ACCESS_TOKEN = 'synthetic-callback-secret'
  route.__setHandlerForTest('webhooks', async () => Response.json({ accepted: true }))

  const callback = (secret: string) => new Request('http://localhost/api/mdk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-moneydevkit-webhook-secret': secret,
    },
    body: JSON.stringify({ handler: 'webhooks' }),
  })

  try {
    assert.equal((await route.POST(callback('wrong'))).status, 401)
    const response = await route.POST(callback('synthetic-callback-secret'))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { accepted: true })
  } finally {
    route.__resetHandlersForTest()
    if (previous === undefined) delete process.env.MDK_ACCESS_TOKEN
    else process.env.MDK_ACCESS_TOKEN = previous
  }
})

test('WebSocket control RPC uses the installed client link and reports NODE_NOT_READY', { timeout: 8000 }, async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const connected = once(server, 'connection')
  const queue = new CmdQueue()
  queue.push = (command) => {
    assert.equal(command.kind, 'createBolt11')
    if (command.kind === 'createBolt11') {
      assert.equal(command.amountMsat, 20000)
      command.resolve({ bolt11: 'synthetic-not-payable', paymentHash: 'synthetic-hash', expiresAt: 1234, scid: 'synthetic-scid' })
    }
  }
  const context = {
    url: `ws://127.0.0.1:${address.port}/control`,
    accessToken: 'synthetic-only',
    queue,
    eventQueue: new EventQueue(),
    sessionState: { nodeReady: true, draining: false },
    env: { WITHDRAWAL_DESTINATION: undefined },
    leaseTimeoutMs: 1000,
  }

  let control: Awaited<ReturnType<typeof connectControl>> | undefined
  try {
    const pending = connectControl(context)
    const [socket, request] = await connected
    assert.equal(request.headers.authorization, 'Bearer synthetic-only')
    socket.send(JSON.stringify({ type: 'lease.granted' }))
    control = await pending
    assert.equal(control.status, 'ok')
    if (control.status !== 'ok') return

    const client = createORPCClient<RouterClient<typeof nodeControlRouter>>(new RPCLink({ websocket: socket }))
    const result = await client.invoice.createBolt11({
      amountMsat: 20000,
      description: 'synthetic',
      expirySecs: 600,
      idempotencyKey: 'synthetic-test',
    }, { signal: AbortSignal.timeout(2000) })
    assert.equal(result.bolt11, 'synthetic-not-payable')
    const events = await client.events(undefined, { signal: AbortSignal.timeout(2000) })
    context.eventQueue.push({ type: 'ready', nodeId: 'synthetic-node' })
    assert.deepEqual((await events.next()).value, { type: 'ready', nodeId: 'synthetic-node' })
    await events.return?.()

    context.sessionState.nodeReady = false
    await assert.rejects(client.invoice.createBolt11({
      amountMsat: 20000,
      description: 'synthetic',
      expirySecs: 600,
      idempotencyKey: 'synthetic-test',
    }, { signal: AbortSignal.timeout(2000) }), (error: { code?: string }) => error.code === 'NODE_NOT_READY')
  } finally {
    if (control?.status === 'ok') await control.client.close(0)
    for (const socket of server.clients) socket.terminate()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
