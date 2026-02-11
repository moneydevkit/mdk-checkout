import { getDaemonStatus, startDaemonInBackground, getPort } from '../daemon.js'

export async function startCommand(): Promise<void> {
  const status = getDaemonStatus()

  if (status.running) {
    console.log(JSON.stringify({ started: false, reason: 'already_running', pid: status.pid }))
    return
  }

  try {
    const port = getPort()
    const { pid } = await startDaemonInBackground(port)
    console.log(JSON.stringify({ started: true, pid, port }))
  } catch (err) {
    console.log(JSON.stringify({ started: false, reason: (err as Error).message }))
    process.exit(1)
  }
}
