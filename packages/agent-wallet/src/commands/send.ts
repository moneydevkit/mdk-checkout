import { WalletClient } from '../client.js'
import { ensureDaemonRunning } from '../daemon.js'

export interface SendOptions {
  destination: string
  amount?: number
}

export async function send(options: SendOptions): Promise<void> {
  const { port } = await ensureDaemonRunning()
  const client = new WalletClient(port)

  const result = await client.send(options.destination, options.amount)
  console.log(JSON.stringify({ payment_id: result.paymentId, payment_hash: result.paymentHash, preimage: result.preimage }))
}
