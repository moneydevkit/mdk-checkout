import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { getPidFile, getConfigDir } from './config.js'

const DEFAULT_PORT = 3456

export interface DaemonStatus {
  running: boolean
  pid?: number
  port?: number
}

export function getDaemonStatus(): DaemonStatus {
  const pidFile = getPidFile()

  if (!fs.existsSync(pidFile)) {
    return { running: false }
  }

  try {
    const data = fs.readFileSync(pidFile, 'utf-8')
    const { pid, port } = JSON.parse(data)

    // Check if process is running
    try {
      process.kill(pid, 0)
      return { running: true, pid, port }
    } catch {
      // Process not running, clean up stale PID file
      fs.unlinkSync(pidFile)
      return { running: false }
    }
  } catch {
    return { running: false }
  }
}

export function saveDaemonPid(pid: number, port: number): void {
  const pidFile = getPidFile()
  const configDir = getConfigDir()

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
  }

  fs.writeFileSync(pidFile, JSON.stringify({ pid, port }), { mode: 0o600 })
}

export function removeDaemonPid(): void {
  const pidFile = getPidFile()
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile)
  }
}

export function getPort(): number {
  const portEnv = process.env.MDK_WALLET_PORT
  if (portEnv) {
    const port = parseInt(portEnv, 10)
    if (!isNaN(port) && port > 0 && port < 65536) {
      return port
    }
  }
  return DEFAULT_PORT
}

export async function startDaemonInBackground(port: number): Promise<{ pid: number }> {
  // Find the entry point - could be running from dist or via npx
  const entryPoint = process.argv[1]

  const logFile = path.join(getConfigDir(), 'daemon.log')

  // Start the daemon process
  const child = spawn(process.execPath, [entryPoint, '--daemon-internal', '--port', String(port)], {
    detached: true,
    stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')],
    env: { ...process.env },
  })

  child.unref()

  if (!child.pid) {
    throw new Error('Failed to start daemon process')
  }

  // Wait for the server to be ready
  const maxWaitMs = 30000
  const pollIntervalMs = 100
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) {
        return { pid: child.pid }
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error('Daemon failed to start within timeout')
}

export async function ensureDaemonRunning(): Promise<{ port: number }> {
  const status = getDaemonStatus()

  if (status.running && status.port) {
    return { port: status.port }
  }

  const port = getPort()
  await startDaemonInBackground(port)
  return { port }
}

export function stopDaemon(): boolean {
  const status = getDaemonStatus()

  if (!status.running || !status.pid) {
    return false
  }

  try {
    process.kill(status.pid, 'SIGTERM')
    removeDaemonPid()
    return true
  } catch {
    return false
  }
}
