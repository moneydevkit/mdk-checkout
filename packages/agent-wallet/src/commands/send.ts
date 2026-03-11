import type { PaymentStatus } from '../payment-store.js'
import { WalletClient } from '../client.js'
import { ensureDaemonRunning } from '../daemon.js'

export interface SendOptions {
  destination: string
  amount?: number
}

export interface SendResult {
  paymentId: string
  paymentHash: string | null
  status: PaymentStatus
  preimage: string | null
}

const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 2 * 60 * 1000

export async function send(options: SendOptions): Promise<SendResult> {
  const { port } = await ensureDaemonRunning()
  const client = new WalletClient(port)

  const { paymentId } = await client.send(options.destination, options.amount)
  console.error(`[wallet] Payment initiated, id=${paymentId}`)

  // Poll until the payment settles or we give up waiting
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let payment = await client.getPayment(paymentId)

  while (payment.status === 'pending' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    payment = await client.getPayment(paymentId)
  }

  const result: SendResult = {
    paymentId: payment.paymentId ?? paymentId,
    paymentHash: payment.paymentHash,
    status: payment.status,
    preimage: payment.preimage ?? null,
  }

  console.log(JSON.stringify({
    payment_id: result.paymentId,
    payment_hash: result.paymentHash,
    status: result.status,
    preimage: result.preimage,
  }))

  if (result.status === 'failed') {
    throw new Error(`Payment ${result.paymentId} failed`)
  }

  if (result.status === 'pending') {
    throw new Error(`Payment ${result.paymentId} still pending after ${POLL_TIMEOUT_MS / 1000}s`)
  }

  return result
}
