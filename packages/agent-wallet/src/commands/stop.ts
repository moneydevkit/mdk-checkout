import { stopDaemon, getDaemonStatus } from '../daemon.js'

export function stop(): void {
  const status = getDaemonStatus()

  if (!status.running) {
    console.log(JSON.stringify({ stopped: false, reason: 'not_running' }))
    return
  }

  const stopped = stopDaemon()
  console.log(JSON.stringify({ stopped }))
}
