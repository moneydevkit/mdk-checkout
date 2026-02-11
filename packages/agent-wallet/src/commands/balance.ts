import { WalletClient } from '../client.js'
import { ensureDaemonRunning } from '../daemon.js'

export async function balance(): Promise<void> {
  const { port } = await ensureDaemonRunning()
  const client = new WalletClient(port)

  const result = await client.balance()
  console.log(JSON.stringify({ balance_sats: result.balanceSats }))
}
