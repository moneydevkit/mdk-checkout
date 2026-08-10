import { stopDaemon, getDaemonStatus, startDaemonInBackground, getPort } from '../daemon.js'

export async function restart(): Promise<void> {
  const status = getDaemonStatus()

  if (status.running) {
    // Awaited, and a still-running daemon is fatal: spawning a replacement while
    // the old one holds the port produces a dead process whose launcher would
    // happily accept the old daemon's answer to its readiness probe. A stale
    // record is fine to proceed on - nothing is holding the port.
    const result = await stopDaemon()
    if (!result.stopped && result.reason === 'still_running') {
      console.log(
        JSON.stringify({ restarted: false, reason: 'old_daemon_still_running', pid: status.pid }),
      )
      process.exit(1)
    }
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
