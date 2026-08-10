import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as http from 'node:http'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

// daemon.ts/config.ts resolve ~/.mdk-wallet at import time, so redirect HOME
// before they load. Hence the dynamic import below.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mdk-wallet-daemon-'))
const realHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome

const { saveDaemonPid, removeDaemonPid, getDaemonStatus, stopDaemon } = await import(
  '../src/daemon.js'
)
const { getPidFile } = await import('../src/config.js')

// A port nothing is listening on: identifyDaemon must get no answer there.
const DEAD_PORT = 34567

after(() => {
  fs.rmSync(fakeHome, { recursive: true, force: true })
  process.env.HOME = realHome.HOME
  process.env.USERPROFILE = realHome.USERPROFILE
})

test('a stale record naming an unrelated live process is never signalled', async () => {
  // The scenario: the daemon was killed with -9 (so its record survived) and the
  // OS handed that pid to something else. Sending SIGTERM on the strength of a
  // file alone would kill a stranger's process, so the daemon has to identify
  // itself over its own authenticated API first.
  const victim = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], {
    stdio: 'ignore',
  })
  await new Promise((resolve) => victim.once('spawn', resolve))
  saveDaemonPid(victim.pid!, DEAD_PORT)

  try {
    assert.deepEqual(getDaemonStatus(), { running: true, pid: victim.pid, port: DEAD_PORT })

    const result = await stopDaemon()
    assert.deepEqual(result, { stopped: false, reason: 'stale_record' })
    assert.equal(victim.exitCode, null, 'the unrelated process must still be running')
    assert.equal(fs.existsSync(getPidFile()), false, 'the stale record should be cleared')
  } finally {
    victim.kill('SIGKILL')
  }
})

test('a process squatting the port cannot get an unrelated pid signalled', async () => {
  // The reason the identity check reads the process table instead of asking over
  // the port: whatever holds 127.0.0.1:<port> can answer with any pid it likes.
  // An earlier version trusted that answer, and this exact setup got the victim
  // SIGTERMed.
  const victim = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], {
    stdio: 'ignore',
  })
  await new Promise((resolve) => victim.once('spawn', resolve))

  const squatter = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    // No token check at all, and it claims to be the victim.
    res.end(JSON.stringify({ success: true, data: { status: 'ok', pid: victim.pid } }))
  })
  const squatPort: number = await new Promise((resolve) => {
    squatter.listen(0, '127.0.0.1', () => {
      const address = squatter.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
  saveDaemonPid(victim.pid!, squatPort)

  try {
    assert.deepEqual(await stopDaemon(), { stopped: false, reason: 'stale_record' })
    assert.equal(victim.exitCode, null, 'the squatter must not get the victim killed')
  } finally {
    victim.kill('SIGKILL')
    squatter.close()
  }
})

test('a record naming a dead pid reports not running and is cleared', async () => {
  const dead = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await new Promise((resolve) => dead.once('exit', resolve))
  saveDaemonPid(dead.pid!, DEAD_PORT)

  assert.deepEqual(getDaemonStatus(), { running: false })
  assert.equal(fs.existsSync(getPidFile()), false)

  assert.deepEqual(await stopDaemon(), { stopped: false, reason: 'not_running' })
})

test('removeDaemonPid only clears the record it owns', async () => {
  saveDaemonPid(4242, DEAD_PORT)

  // A daemon that failed to start must not delete the record of the healthy one
  // that replaced it.
  removeDaemonPid(9999)
  assert.equal(fs.existsSync(getPidFile()), true)

  removeDaemonPid(4242)
  assert.equal(fs.existsSync(getPidFile()), false)

  // Absent file: nothing to remove, and no throw.
  removeDaemonPid(4242)
})
