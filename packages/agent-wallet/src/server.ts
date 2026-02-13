import * as http from 'node:http'
import { createRequire } from 'node:module'
import { loadConfig, savePayment, loadPayments, type WalletConfig, type StoredPayment } from './config.js'
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

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

// Payment event types from lightning-js
const PaymentEventType = {
  Claimable: 0,
  Received: 1,
  Failed: 2,
} as const

class WalletServer {
  private server: http.Server
  private config: WalletConfig
  private node: MdkNodeInstance | null = null
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private pendingClaims = new Set<string>()

  constructor(config: WalletConfig) {
    this.config = config
    this.server = http.createServer((req, res) => this.handleRequest(req, res))
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, '127.0.0.1', () => {
        console.log(`[wallet] Server listening on http://127.0.0.1:${port}`)
        saveDaemonPid(process.pid, port)

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

        resolve()
      })
    })
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
            ...(event.payerNote ? { payerNote: event.payerNote } : {}),
          })
        }

        this.node.ackEvent()
        break
      }

      case PaymentEventType.Failed:
        console.log(`[wallet] PaymentFailed hash=${event.paymentHash} reason=${event.reason}`)
        this.pendingClaims.delete(event.paymentHash)
        this.node.ackEvent()
        break
    }
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    if (this.node) {
      console.log('[wallet] Stopping node...')
      this.node.stopReceiving()
      this.node = null
    }

    this.server.close()
    removeDaemonPid()
    console.log('[wallet] Server stopped')
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    try {
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

      error(res, 404, 'NOT_FOUND', 'Endpoint not found')
    } catch (err) {
      console.error('[wallet] Request error:', err)
      error(res, 500, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  private handleHealth(res: http.ServerResponse): void {
    success(res, { status: 'ok', nodeRunning: this.node !== null })
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
      // payWhileRunning handles all destination types: bolt11, bolt12, lnurl, lightning address
      // amount is optional for fixed-amount bolt11 invoices
      const amountMsat = amountSats ? amountSats * 1000 : null
      const result = this.node.payWhileRunning(destination, amountMsat, 30)

      savePayment({
        paymentId: result.paymentId,
        paymentHash: result.paymentHash ?? null,
        amountSats: amountSats ?? 0, // TODO: extract amount from invoice for fixed-amount
        direction: 'outbound',
        timestamp: Date.now(),
        destination,
      })

      success(res, {
        paymentId: result.paymentId,
        paymentHash: result.paymentHash ?? null,
        preimage: result.preimage ?? null,
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
}

export async function startServer(port: number): Promise<WalletServer> {
  const config = loadConfig()

  if (!config) {
    throw new Error('Wallet not initialized. Run: npx @moneydevkit/agent-wallet init')
  }

  const server = new WalletServer(config)
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
