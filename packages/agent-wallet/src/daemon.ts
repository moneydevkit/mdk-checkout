import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { getPidFile, getConfigDir, ensureApiToken } from './config.js'

const DEFAULT_PORT = 3456

export interface DaemonStatus {
  running: boolean
  pid?: number
  port?: number
}

/** Outcome of stopping the daemon; `reason` explains a false `stopped`. */
export interface StopResult {
  stopped: boolean
  reason?: 'not_running' | 'stale_record' | 'still_running'
}

/**
 * Whether `pid` looks like this package's daemon, judged from the process table.
 *
 * The check is deliberately local. Asking over the port proves nothing about the
 * pid: whatever holds 127.0.0.1:<port> can answer with any pid it likes, and a
 * hostile squatter would happily name a process it wants killed. `ps` cannot be
 * lied to by the network.
 *
 * 'unknown' means the question could not be asked (no `ps`, e.g. Windows), in
 * which case callers fall back to trusting the PID file as before rather than
 * refusing to ever stop the daemon.
 */
function daemonIdentity(pid: number): 'daemon' | 'other' | 'unknown' {
  try {
    const command = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    // Covers both the spawned `--daemon-internal` child and a foreground
    // `--daemon`. A recycled pid belonging to something unrelated will not match.
    return command.includes('--daemon') ? 'daemon' : 'other'
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'unknown'
    // ps ran and failed: no such process.
    return 'other'
  }
}

/**
 * Ask whatever serves `port` which process it claims to be. Returns null when
 * nothing answers.
 *
 * This is an accuracy aid, not an identity proof - see daemonIdentity(). Never
 * base a signal or a security decision on the number it returns.
 */
async function identifyDaemon(port: number): Promise<number | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Authorization: `Bearer ${ensureApiToken()}` },
    })
    if (!response.ok) return null
    const body = (await response.json()) as { data?: { pid?: number } }
    return body.data?.pid ?? null
  } catch {
    return null
  }
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
      // Process not running: clear the record, but only if it still names that
      // pid, so a daemon that started in the meantime keeps its own.
      removeDaemonPid(pid)
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

/**
 * Clear the PID record, but only when it still describes `pid`. A daemon that
 * fails to start must not delete the record of the healthy daemon that replaced
 * it in the meantime.
 */
export function removeDaemonPid(pid: number = process.pid): void {
  const pidFile = getPidFile()
  try {
    if (JSON.parse(fs.readFileSync(pidFile, 'utf-8')).pid !== pid) return
  } catch {
    // Absent or unreadable: nothing of ours to remove.
    return
  }
  try {
    fs.unlinkSync(pidFile)
  } catch {
    // Someone else cleaned it up between the read and the unlink.
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

  // Mint the token before the spawn so the readiness probe below can pass the
  // daemon's own auth gate; the child converges on the same file.
  const apiToken = ensureApiToken()

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
    // A dead child cannot become ready. Fail immediately with the reason rather
    // than polling a port that some other process may be answering on.
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Daemon exited during startup (code=${child.exitCode ?? child.signalCode}); see ${logFile}`,
      )
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      })
      if (response.ok) {
        const body = (await response.json()) as { data?: { pid?: number } }
        // Report whoever is actually serving. Under a concurrent start our child
        // can lose the bind race and die while the winner answers this probe;
        // returning our child's pid would name a corpse.
        return { pid: body.data?.pid ?? child.pid }
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

  // A daemon can be alive with no usable record (killed -9, or a lost race on
  // the file). Adopt it rather than spawning a replacement that cannot bind. The
  // pid it reports is unverified, but nothing acts on it without a process-table
  // check first, and the CLI would be talking to whatever holds this port anyway.
  const livePid = await identifyDaemon(port)
  if (livePid) {
    saveDaemonPid(livePid, port)
    return { port }
  }

  await startDaemonInBackground(port)
  return { port }
}

/**
 * Wait for a process to disappear. Returns false if it is still alive at the
 * deadline.
 */
async function waitForExit(pid: number, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch (err) {
      // Only ESRCH means gone. EPERM means it is alive and owned by someone
      // else, which must not be reported as an exit.
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

/**
 * Stop the daemon and wait for it to actually exit. The wait is the point:
 * shutting down the Lightning node takes seconds, and a caller that spawns a
 * replacement immediately (`restart`) would hit EADDRINUSE on the still-bound
 * port and report a bogus "failed to start".
 */
export async function stopDaemon(): Promise<StopResult> {
  const status = getDaemonStatus()

  if (!status.running || !status.pid || !status.port) {
    return { stopped: false, reason: 'not_running' }
  }

  // Never signal a pid on the strength of a file alone. A record can outlive its
  // daemon (SIGKILL, a crash) and the OS can hand that pid to something else, so
  // confirm from the process table that it is still our daemon.
  if (daemonIdentity(status.pid) === 'other') {
    removeDaemonPid(status.pid)
    return { stopped: false, reason: 'stale_record' }
  }

  try {
    process.kill(status.pid, 'SIGTERM')
  } catch {
    removeDaemonPid(status.pid)
    return { stopped: false, reason: 'stale_record' }
  }

  if (!(await waitForExit(status.pid))) {
    // Still alive at the deadline. Leave its PID record in place: deleting the
    // record of a running daemon would hide it from `status` and let a caller
    // spawn a replacement that cannot bind the port.
    return { stopped: false, reason: 'still_running' }
  }

  // The record belongs to the daemon that was stopped, not to this CLI process.
  removeDaemonPid(status.pid)
  return { stopped: true }
}
