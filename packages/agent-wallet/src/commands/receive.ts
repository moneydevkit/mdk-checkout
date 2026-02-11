import qrcode from 'qrcode-terminal'
import { WalletClient } from '../client.js'
import { ensureDaemonRunning } from '../daemon.js'

export interface ReceiveOptions {
  amount?: number
  description?: string
}

export async function receive(options: ReceiveOptions): Promise<void> {
  const { port } = await ensureDaemonRunning()
  const client = new WalletClient(port)

  const result = await client.receive(options.amount, options.description)

  // JSON to stdout (for machines/AI)
  console.log(
    JSON.stringify({
      invoice: result.invoice,
      payment_hash: result.paymentHash,
      expires_at: result.expiresAt,
    })
  )

  // Human-readable output to stderr
  console.error('')
  qrcode.generate(result.invoice, { small: true }, (qr) => {
    console.error(qr)
    console.error(result.invoice)
    console.error('')
  })
}
