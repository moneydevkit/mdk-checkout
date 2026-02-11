import { WalletClient } from '../client.js'
import { ensureDaemonRunning } from '../daemon.js'

export async function payments(): Promise<void> {
  const { port } = await ensureDaemonRunning()
  const client = new WalletClient(port)

  const result = await client.payments()
  console.log(JSON.stringify({ payments: result.payments }))
}
