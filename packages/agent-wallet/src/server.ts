import * as http from 'node:http'
import * as crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { decode as decodeBolt11 } from 'light-bolt11-decoder'
import { loadConfig, ensureApiToken, saveFeeClaim, savePayment, updatePayment, findPayment, loadPayments, type WalletConfig, type StoredPayment } from './config.js'
import { cachedClaimFor, fetchFeeClaim } from './fee-claim.js'
import { getNodeOptions } from './mdk-config.js'
import { saveDaemonPid, removeDaemonPid } from './daemon.js'

type LightningModule = typeof import('@moneydevkit/lightning-js')
type MdkNodeClass = LightningModule['MdkNode']
type MdkNodeInstance = InstanceType<MdkNodeClass>

declare const __non_webpack_require__: typeof require | undefined

const getRuntimeRequire = () => {
  if (typeof __non_webpack_require__ === 'function') {
    return __non_webpack_require__
  }

  try {
    return createRequire(import.meta.url)
  } catch {
    if (typeof require === 'function') {
      return require
    }
    throw new Error('Unable to resolve require function')
  }
}

let cachedLightningModule: LightningModule | undefined

function loadLightningModule(): LightningModule {
  if (!cachedLightningModule) {
    const runtimeRequire = getRuntimeRequire()
    cachedLightningModule = runtimeRequire('@moneydevkit/lightning-js') as LightningModule
  }
  return cachedLightningModule
}

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

function jsonResponse(res: http.ServerResponse, status: number, body: ApiResponse): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function success<T>(res: http.ServerResponse, data: T): void {
  jsonResponse(res, 200, { success: true, data })
}

function error(res: http.ServerResponse, status: number, code: string, message: string): void {
  jsonResponse(res, status, { success: false, error: { code, message } })
}

/** Ample for an invoice or an offer; anything larger is a mistake or an attack. */
const MAX_BODY_BYTES = 64 * 1024

/** Thrown when a request body exceeds MAX_BODY_BYTES, answered with 413. */
class BodyTooLargeError extends Error {}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let overflowed = false
    req.on('data', (chunk: Buffer) => {
      if (overflowed) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        // Stop buffering but let the response go out; Node discards the rest.
        overflowed = true
        chunks.length = 0
        reject(new BodyTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!overflowed) resolve(Buffer.concat(chunks).toString('utf-8'))
    })
    req.on('error', reject)
  })
}

/** Extract the amount in satoshis from a BOLT11 invoice string, or null if variable-amount. */
function extractBolt11AmountSats(invoice: string): number | null {
  try {
    const decoded = decodeBolt11(invoice)
    const section = decoded.sections.find((s) => s.name === 'amount')
    if (!section || !('value' in section)) return null
    const msat = parseInt(section.value, 10)
    return Number.isNaN(msat) ? null : Math.floor(msat / 1000)
  } catch {
    return null
  }
}

/**
 * Host header hostnames that name this machine. Anything else means the request
 * arrived via some other name, i.e. DNS rebinding.
 *
 * Numeric aliases (`127.1`, `2130706433`) normalize to `127.0.0.1` during URL
 * parsing and are accepted on purpose: they can only ever mean loopback, so no
 * DNS record can point them elsewhere. `[::1]` is defensive - the daemon binds
 * IPv4 today, but a future bind change would otherwise 401 every caller.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/**
 * Request headers that only a browser sends. Both are forbidden header names,
 * so a page can neither strip nor forge them, which makes their presence a
 * reliable "this came from a web page" signal.
 *
 * `sec-fetch-mode` is deliberately NOT in this list: Node's own fetch (undici)
 * sends `sec-fetch-mode: cors`, so checking it would 401 the CLI itself.
 */
const BROWSER_HEADERS = ['origin', 'sec-fetch-site'] as const

// Payment event types from lightning-js
const PaymentEventType = {
  Claimable: 0,
  Received: 1,
  Failed: 2,
  Sent: 3,
} as const

export class WalletServer {
  private server: http.Server
  private config: WalletConfig
  private apiToken: string
  private node: MdkNodeInstance | null = null
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private pendingClaims = new Set<string>()

  constructor(config: WalletConfig, apiToken: string) {
    this.config = config
    this.apiToken = apiToken
    this.server = http.createServer((req, res) => this.handleRequest(req, res))
    // Node's defaults (60s for headers, 5min for a request) let a handful of
    // half-open connections sit on the event loop of a process that is also
    // servicing a Lightning node. Local calls answer in milliseconds.
    this.server.headersTimeout = 10_000
    this.server.requestTimeout = 15_000
    // A local client needs one or two sockets. The cap bounds what an
    // unauthenticated local process can tie up before it is turned away.
    this.server.maxConnections = 64
  }

  /**
   * Fetch and cache the agent-wallet fee claim if we don't hold one for the
   * node we are about to boot. Must run before the node is constructed: the
   * claim is node config, presented during LSPS4 registration. Best-effort by
   * design; on failure the wallet runs at the standard rate and the next
   * daemon start retries.
   *
   * The cache is keyed by node_id, not by "a claim exists": MDK_WALLET_MNEMONIC
   * can change the effective node under a config file whose cached claim
   * belongs to a different node, and a mismatched claim is worse than none
   * (the LSP rejects it and the wallet still pays the standard rate).
   */
  private async ensureFeeClaim(): Promise<void> {
    // An operator-supplied claim is authoritative; never second-guess it.
    if (process.env.MDK_WALLET_FEE_CLAIM) return
    try {
      const { deriveNodeId } = loadLightningModule()
      const nodeId = deriveNodeId(this.config.mnemonic, this.config.network)
      if (cachedClaimFor(this.config, nodeId)) return
      // Stale-or-absent: never present a claim bound to another node.
      this.config = { ...this.config, feeClaim: undefined, feeClaimNodeId: undefined }
      const claim = await fetchFeeClaim(nodeId, getNodeOptions(this.config.network).mintFeeClaimUrl)
      if (!claim) return
      this.config = { ...this.config, feeClaim: claim, feeClaimNodeId: nodeId }
      // Persist only when the mnemonic came from the config file; under an
      // env override the claim belongs to a node the file does not describe.
      if (!process.env.MDK_WALLET_MNEMONIC) {
        saveFeeClaim(claim, nodeId)
      }
      console.log('[fee-claim] minted and cached agent-wallet fee claim')
    } catch (err) {
      console.error(`[fee-claim] skipping fee claim: ${err}`)
    }
  }

  /**
   * Bind the HTTP API to loopback and resolve with the port actually bound
   * (which differs from `port` when asked for 0). Separate from the node boot
   * so the auth gate can be exercised without a Lightning node.
   */
  listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => reject(err)
      this.server.once('error', onError)
      this.server.listen(port, '127.0.0.1', () => {
        this.server.removeListener('error', onError)
        const address = this.server.address()
        const boundPort = typeof address === 'object' && address ? address.port : port
        console.log(`[wallet] Server listening on http://127.0.0.1:${boundPort}`)
        resolve(boundPort)
      })
    })
  }

  async start(port: number): Promise<void> {
    await this.ensureFeeClaim()
    const boundPort = await this.listen(port)
    try {
      // Inside the cleanup scope: a PID write that fails (full disk, bad
      // permissions) must not leave a live listener behind either.
      saveDaemonPid(process.pid, boundPort)
      this.startNode()
    } catch (err) {
      // Never leave a listening socket and a PID file behind for a node that
      // failed to boot: the CLI would see a healthy daemon that cannot pay.
      // Cleanup must not mask why the boot failed - a half-built node can throw
      // out of stopReceiving().
      try {
        this.stop()
      } catch (stopErr) {
        console.error('[wallet] Cleanup after failed start also failed:', stopErr)
      }
      throw err
    }
  }

  private startNode(): void {
    // Create and start the node
    const { MdkNode, setLogListener } = loadLightningModule()

    // Enable trace logging filtered to onion/bolt12/offers related messages
    // Note: msg.level is a string like "TRACE", "DEBUG", "INFO", "WARN", "ERROR"
    const highLevels = new Set(['INFO', 'WARN', 'ERROR'])
    setLogListener((msg: { level: string; modulePath: string; line: number; message: string } | null) => {
      if (!msg) return
      const text = msg.message.toLowerCase()
      const mod = msg.modulePath.toLowerCase()
      // Always log INFO+ regardless of topic
      if (highLevels.has(msg.level)) {
        console.error(`[ldk-node ${msg.level} ${msg.modulePath}:${msg.line}] ${msg.message}`)
        return
      }
      // For TRACE/DEBUG, filter to onion/bolt12/offers topics
      if (
        text.includes('onion') ||
        text.includes('invoice_request') ||
        text.includes('invoicerequest') ||
        text.includes('blinded') ||
        text.includes('offer') ||
        text.includes('bolt12') ||
        text.includes('forward') ||
        text.includes('peel') ||
        text.includes('message_recipients') ||
        text.includes('lsps4') ||
        mod.includes('onion_message') ||
        mod.includes('offers') ||
        mod.includes('messenger')
      ) {
        console.error(`[${msg.level} ${msg.modulePath}:${msg.line}] ${msg.message}`)
      }
    }, 'trace')

    const nodeOptions = getNodeOptions(this.config.network)

    this.node = new MdkNode({
      network: nodeOptions.network,
      mdkApiKey: this.config.walletId,
      vssUrl: nodeOptions.vssUrl,
      esploraUrl: nodeOptions.esploraUrl,
      rgsUrl: nodeOptions.rgsUrl,
      mnemonic: this.config.mnemonic,
      lspNodeId: nodeOptions.lspNodeId,
      lspAddress: nodeOptions.lspAddress,
      scoringParamOverrides: nodeOptions.scoringParamOverrides,
      feeClaim: this.config.feeClaim,
    })

    console.log(`[wallet] Node initialized, id=${this.node.getNodeId()}`)
    console.log('[wallet] Starting node for receiving...')
    this.node.startReceiving()
    console.log('[wallet] Node started, beginning event polling')

    // Register LSPS4 on startup so we can respond to InvoiceRequests
    // for persistent BOLT12 offers (e.g. BIP353 DNS-backed offers).
    try {
      console.log('[wallet] Registering LSPS4 for BOLT12 receive...')
      this.node.getVariableAmountBolt12OfferWhileRunning('lsps4 registration')
      console.log('[wallet] LSPS4 registered, ready for BOLT12 payments')
    } catch (err) {
      console.error('[wallet] LSPS4 registration failed:', err)
    }

    // Poll for events every 100ms
    this.pollInterval = setInterval(() => this.pollEvents(), 100)
  }

  private pollEvents(): void {
    if (!this.node) return

    const event = this.node.nextEvent()
    if (!event) return

    switch (event.eventType) {
      case PaymentEventType.Claimable:
        console.log(`[wallet] PaymentClaimable hash=${event.paymentHash} amount=${event.amountMsat}msat`)
        this.pendingClaims.add(event.paymentHash)
        this.node.ackEvent()
        break

      case PaymentEventType.Received: {
        const amountSats = Math.floor((event.amountMsat ?? 0) / 1000)
        const noteStr = event.payerNote ? ` payer_note="${event.payerNote}"` : ''
        console.log(`[wallet] PaymentReceived hash=${event.paymentHash} amount=${amountSats}sats${noteStr}`)
        this.pendingClaims.delete(event.paymentHash)

        // LDK replays PaymentReceived events on restart - deduplicate by hash
        const existing = loadPayments()
        if (!existing.some((p) => p.paymentHash === event.paymentHash)) {
          savePayment({
            paymentHash: event.paymentHash,
            amountSats,
            direction: 'inbound',
            timestamp: Date.now(),
            status: 'completed',
            ...(event.payerNote ? { payerNote: event.payerNote } : {}),
          })
        }

        this.node.ackEvent()
        break
      }

      case PaymentEventType.Sent: {
        const pid = event.paymentId
        console.log(`[wallet] PaymentSent id=${pid} hash=${event.paymentHash} preimage=${event.preimage}`)

        if (pid) {
          updatePayment(pid, {
            status: 'completed',
            preimage: event.preimage ?? undefined,
            paymentHash: event.paymentHash,
          })
        }

        this.node.ackEvent()
        break
      }

      case PaymentEventType.Failed: {
        const pid = event.paymentId
        console.log(`[wallet] PaymentFailed id=${pid} hash=${event.paymentHash} reason=${event.reason}`)
        this.pendingClaims.delete(event.paymentHash)

        // Update outbound payment status if we have a paymentId
        if (pid) {
          updatePayment(pid, { status: 'failed' })
        }

        this.node.ackEvent()
        break
      }
    }
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    if (this.node) {
      console.log('[wallet] Stopping node...')
      try {
        this.node.stopReceiving()
      } catch (err) {
        // A half-built node can throw here. Closing the socket and clearing the
        // PID file matters more: without them the CLI keeps talking to a corpse.
        console.error('[wallet] Node shutdown failed:', err)
      }
      this.node = null
    }

    this.server.close()
    removeDaemonPid()
    console.log('[wallet] Server stopped')
  }

  /**
   * Decide whether a request may touch the wallet at all. Loopback is not a
   * trust boundary: every web page the user visits can POST to 127.0.0.1, and
   * every other process and user on the box can too. Three independent layers,
   * cheapest first:
   *
   * 1. Reject anything carrying a browser fetch marker. Kills the drive-by CSRF
   *    vector even if the token ever leaks into a page.
   * 2. Require a loopback `Host`. Stops DNS rebinding, where an attacker domain
   *    resolves to 127.0.0.1 and would otherwise look same-origin.
   * 3. Require the bearer token from ~/.mdk-wallet/auth.token (0600), compared
   *    in constant time. Stops other users on the box and any process that
   *    cannot read that file. It does not stop code running as this user: that
   *    code can read the token, and the mnemonic sitting next to it.
   */
  private authorized(req: http.IncomingMessage): boolean {
    if (BROWSER_HEADERS.some((name) => req.headers[name] !== undefined)) return false

    // Node does not reject a duplicate Host header, it silently keeps the first
    // one, so `req.headers.host` alone can be the innocent half of a smuggled
    // pair. Exactly one Host is required; zero covers HTTP/1.0 with none.
    let hostHeaders = 0
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i].toLowerCase() === 'host') hostHeaders++
    }
    if (hostHeaders !== 1) return false

    const hostHeader = req.headers.host
    if (!hostHeader) return false
    let hostname: string
    try {
      hostname = new URL(`http://${hostHeader}`).hostname
    } catch {
      return false
    }
    if (!LOOPBACK_HOSTS.has(hostname)) return false

    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith('Bearer ')) return false
    const given = Buffer.from(auth.slice(7), 'utf-8')
    const expected = Buffer.from(this.apiToken, 'utf-8')
    // timingSafeEqual throws on length mismatch, so length is checked first.
    return given.length === expected.length && crypto.timingSafeEqual(given, expected)
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Everything, including the auth check and the URL parse, sits inside the
    // try. Nothing may reject out of here: the http callback ignores the
    // returned promise, so an escaping error is an unhandled rejection, and an
    // unhandled rejection kills a daemon that is holding channel state.
    try {
      if (!this.authorized(req)) {
        return error(
          res,
          401,
          'UNAUTHORIZED',
          'Missing or invalid API token. Local CLI only; run `agent-wallet restart` after upgrading.',
        )
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

      if (req.method === 'GET' && url.pathname === '/health') {
        return this.handleHealth(res)
      }

      if (req.method === 'GET' && url.pathname === '/balance') {
        return this.handleBalance(res)
      }

      if (req.method === 'POST' && url.pathname === '/receive') {
        const body = await readBody(req)
        return this.handleReceive(res, body)
      }

      if (req.method === 'POST' && url.pathname === '/receive-bolt12') {
        const body = await readBody(req)
        return this.handleReceiveBolt12(res, body)
      }

      if (req.method === 'POST' && url.pathname === '/send') {
        const body = await readBody(req)
        return this.handleSend(res, body)
      }

      if (req.method === 'GET' && url.pathname === '/payments') {
        return this.handlePayments(res)
      }

      const paymentMatch = url.pathname.match(/^\/payment\/([a-zA-Z0-9_-]+)$/)
      if (req.method === 'GET' && paymentMatch) {
        return this.handleGetPayment(res, paymentMatch[1])
      }

      error(res, 404, 'NOT_FOUND', 'Endpoint not found')
    } catch (err) {
      if (res.headersSent) {
        // Nothing left to say; just let the client see the end of the body.
        console.error('[wallet] Request error after response started:', err)
        res.end()
        return
      }
      if (err instanceof BodyTooLargeError) {
        return error(res, 413, 'BODY_TOO_LARGE', `Request body exceeds ${MAX_BODY_BYTES} bytes`)
      }
      console.error('[wallet] Request error:', err)
      error(res, 500, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  private handleHealth(res: http.ServerResponse): void {
    // `pid` lets a caller prove the process behind the PID file is really this
    // daemon before it signals it: a stale record can name a recycled pid that
    // now belongs to something else entirely.
    success(res, { status: 'ok', nodeRunning: this.node !== null, pid: process.pid })
  }

  private handleBalance(res: http.ServerResponse): void {
    if (!this.node) {
      return error(res, 500, 'NODE_NOT_RUNNING', 'Node not running')
    }

    // Use the *WhileRunning method since node is already started
    const balanceSats = this.node.getBalanceWhileRunning()
    success(res, { balanceSats })
  }

  private handleReceive(res: http.ServerResponse, body: string): void {
    if (!this.node) {
      return error(res, 500, 'NODE_NOT_RUNNING', 'Node not running')
    }

    let amountSats: number | null = null
    let description = 'mdk agent wallet'

    try {
      const parsed = JSON.parse(body) as { amount_sats?: number; description?: string }
      amountSats = parsed.amount_sats ?? null
      if (parsed.description) {
        description = parsed.description
      }
    } catch {
      return error(res, 400, 'INVALID_JSON', 'Invalid JSON body')
    }

    const expirySecs = 15 * 60

    // Use the *WhileRunning methods since node is already started
    const invoice =
      amountSats === null
        ? this.node.getVariableAmountJitInvoiceWhileRunning(description, expirySecs)
        : this.node.getInvoiceWhileRunning(amountSats * 1000, description, expirySecs)

    success(res, {
      invoice: invoice.bolt11,
      paymentHash: invoice.paymentHash,
      expiresAt: new Date(invoice.expiresAt * 1000).toISOString(),
    })
  }

  private handleReceiveBolt12(res: http.ServerResponse, body: string): void {
    if (!this.node) {
      return error(res, 500, 'NODE_NOT_RUNNING', 'Node not running')
    }

    let description = 'mdk agent wallet'
    let expirySecs: number | undefined

    try {
      const parsed = JSON.parse(body) as {
        description?: string
        expiry_secs?: number
      }
      if (parsed.description) {
        description = parsed.description
      }
      expirySecs = parsed.expiry_secs
    } catch {
      return error(res, 400, 'INVALID_JSON', 'Invalid JSON body')
    }

    try {
      const offer = this.node.getVariableAmountBolt12OfferWhileRunning(description, expirySecs)

      success(res, { offer })
    } catch (err) {
      console.error('[wallet] BOLT12 receive error:', err)
      error(res, 500, 'BOLT12_RECEIVE_FAILED', err instanceof Error ? err.message : 'BOLT12 receive failed')
    }
  }

  private handleSend(res: http.ServerResponse, body: string): void {
    if (!this.node) {
      return error(res, 500, 'NODE_NOT_RUNNING', 'Node not running')
    }

    let destination: string
    let amountSats: number | undefined

    try {
      const parsed = JSON.parse(body) as { destination?: string; amount_sats?: number }
      if (!parsed.destination) {
        return error(res, 400, 'MISSING_DESTINATION', 'destination is required')
      }
      destination = parsed.destination
      amountSats = parsed.amount_sats
    } catch {
      return error(res, 400, 'INVALID_JSON', 'Invalid JSON body')
    }

    try {
      // Fire-and-forget: timeout 0 initiates the payment and returns immediately.
      // The Rust runtime continues processing; the pollEvents loop picks up the
      // PaymentSuccessful/PaymentFailed event and updates the stored payment.
      const amountMsat = amountSats ? amountSats * 1000 : null
      const result = this.node.payWhileRunning(destination, amountMsat, 0)

      const resolvedAmountSats = amountSats ?? extractBolt11AmountSats(destination) ?? 0

      savePayment({
        paymentId: result.paymentId,
        paymentHash: result.paymentHash ?? null,
        amountSats: resolvedAmountSats,
        direction: 'outbound',
        timestamp: Date.now(),
        destination,
        status: 'pending',
      })

      success(res, {
        paymentId: result.paymentId,
        paymentHash: result.paymentHash ?? null,
        status: 'pending' as const,
      })
    } catch (err) {
      console.error('[wallet] Send error:', err)
      error(res, 500, 'SEND_FAILED', err instanceof Error ? err.message : 'Send failed')
    }
  }

  private handlePayments(res: http.ServerResponse): void {
    const payments: StoredPayment[] = loadPayments()
    success(res, { payments })
  }

  private handleGetPayment(res: http.ServerResponse, paymentId: string): void {
    const payment = findPayment(paymentId)
    if (!payment) {
      return error(res, 404, 'NOT_FOUND', `Payment ${paymentId} not found`)
    }
    success(res, payment)
  }
}

export async function startServer(port: number): Promise<WalletServer> {
  const config = loadConfig()

  if (!config) {
    throw new Error('Wallet not initialized. Run: npx @moneydevkit/agent-wallet init')
  }

  const server = new WalletServer(config, ensureApiToken())
  await server.start(port)

  const shutdown = () => {
    console.log('\n[wallet] Shutting down...')
    server.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  return server
}
