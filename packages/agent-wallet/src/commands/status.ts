import { getDaemonStatus } from '../daemon.js'

export function status(): void {
  const daemonStatus = getDaemonStatus()

  console.log(
    JSON.stringify({
      running: daemonStatus.running,
      pid: daemonStatus.pid,
      port: daemonStatus.port,
    })
  )
}
