import { stopDaemon, getDaemonStatus } from '../daemon.js'

export async function stop(): Promise<void> {
  const status = getDaemonStatus()

  if (!status.running) {
    console.log(JSON.stringify({ stopped: false, reason: 'not_running' }))
    return
  }

  const result = await stopDaemon()
  console.log(JSON.stringify({ ...result, ...(result.stopped ? {} : { pid: status.pid }) }))
}
