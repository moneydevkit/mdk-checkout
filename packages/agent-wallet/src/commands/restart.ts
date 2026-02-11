import { stopDaemon, getDaemonStatus, startDaemonInBackground, getPort } from '../daemon.js'

export async function restart(): Promise<void> {
  const status = getDaemonStatus()

  if (status.running) {
    stopDaemon()
  }

  try {
    const port = getPort()
    const { pid } = await startDaemonInBackground(port)
    console.log(JSON.stringify({ restarted: true, pid, port }))
  } catch (err) {
    console.log(JSON.stringify({ restarted: false, reason: (err as Error).message }))
    process.exit(1)
  }
}
