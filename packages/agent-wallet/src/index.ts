#!/usr/bin/env node

import { parseArgs, printUsage } from './cli.js'
import { init } from './commands/init.js'
import { balance } from './commands/balance.js'
import { receive } from './commands/receive.js'
import { receiveBolt12 } from './commands/receive-bolt12.js'
import { send } from './commands/send.js'
import { payments } from './commands/payments.js'
import { status } from './commands/status.js'
import { stop } from './commands/stop.js'
import { startCommand } from './commands/start.js'
import { restart } from './commands/restart.js'
import { startServer } from './server.js'
import { configExists } from './config.js'

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  // Handle --daemon-internal flag (started by daemon.ts)
  if (args.daemonInternal) {
    await startServer(args.port)
    return
  }

  // Handle commands
  switch (args.command) {
    case 'init':
      init({ show: args.show, network: args.network })
      break

    case 'balance':
      await balance()
      break

    case 'receive': {
      const amount = args.args[0] ? parseInt(args.args[0], 10) : undefined
      if (args.args[0] && isNaN(amount!)) {
        console.log(JSON.stringify({ error: 'Invalid amount' }))
        process.exit(1)
      }
      await receive({ amount, description: args.description })
      break
    }

    case 'receive-bolt12': {
      await receiveBolt12({ description: args.description })
      break
    }

    case 'send': {
      const destination = args.args[0]
      if (!destination) {
        console.log(JSON.stringify({ error: 'Destination required' }))
        process.exit(1)
      }
      const amount = args.args[1] ? parseInt(args.args[1], 10) : undefined
      if (args.args[1] && isNaN(amount!)) {
        console.log(JSON.stringify({ error: 'Invalid amount' }))
        process.exit(1)
      }
      await send({ destination, amount })
      break
    }

    case 'payments':
      await payments()
      break

    case 'status':
      status()
      break

    case 'stop':
      stop()
      break

    case 'start':
      await startCommand()
      break

    case 'restart':
      await restart()
      break

    case 'help':
      printUsage()
      break

    case '':
      // No command - if --daemon, start server in foreground, otherwise show help
      if (args.daemon) {
        if (!configExists()) {
          console.log(JSON.stringify({ error: 'Not initialized. Run: npx @moneydevkit/agent-wallet init' }))
          process.exit(1)
        }
        await startServer(args.port)
      } else {
        printUsage()
      }
      break

    default:
      console.log(JSON.stringify({ error: `Unknown command: ${args.command}` }))
      printUsage()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
})
