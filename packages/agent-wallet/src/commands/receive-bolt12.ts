import qrcode from 'qrcode-terminal'
import { WalletClient } from '../client.js'
import { ensureDaemonRunning } from '../daemon.js'

export interface ReceiveBolt12Options {
  description?: string
}

export async function receiveBolt12(options: ReceiveBolt12Options): Promise<void> {
  const { port } = await ensureDaemonRunning()
  const client = new WalletClient(port)

  const result = await client.receiveBolt12(options.description)

  // JSON to stdout (for machines/AI)
  console.log(
    JSON.stringify({
      offer: result.offer,
    })
  )

  // Human-readable output to stderr
  console.error('')
  qrcode.generate(result.offer, { small: true }, (qr) => {
    console.error(qr)
    console.error(result.offer)
    console.error('')
  })
}
