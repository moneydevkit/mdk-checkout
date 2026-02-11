import minimist from 'minimist'
import type { Network } from './mdk-config.js'

export interface CliArgs {
  command: string
  args: string[]
  daemon: boolean
  daemonInternal: boolean
  port: number
  show: boolean
  description?: string
  network?: Network
}

const USAGE = `
Usage: npx @moneydevkit/agent-wallet <command> [options]

Commands:
  init                        Initialize wallet (generates mnemonic)
  init --show                 Show current config (mnemonic redacted)
  start                       Start the daemon
  balance                     Get balance in sats
  receive <amount>            Generate BOLT11 invoice for amount (sats)
  receive-bolt12              Generate BOLT12 offer (variable amount)
  send <dest> [amount]        Pay destination (bolt11, bolt12, lnurl, or lightning address)
  payments                    List payment history
  status                      Check if daemon is running
  restart                     Restart the daemon
  stop                        Stop the daemon

Options:
  --daemon             Start server in background
  --port <port>        Server port (default: 3456)
  --network <network>  Network: mainnet or signet (default: mainnet)
  --description <desc> Invoice description (for receive)

Examples:
  npx @moneydevkit/agent-wallet init
  npx @moneydevkit/agent-wallet balance
  npx @moneydevkit/agent-wallet receive 1000
  npx @moneydevkit/agent-wallet send user@getalby.com 500
  npx @moneydevkit/agent-wallet send lnbc10n1...
`.trim()

export function parseArgs(argv: string[]): CliArgs {
  const parsed = minimist(argv.slice(2), {
    boolean: ['daemon', 'daemon-internal', 'show', 'help'],
    string: ['port', 'description', 'network'],
    alias: {
      d: 'daemon',
      p: 'port',
      h: 'help',
      n: 'network',
    },
    default: {
      port: '3456',
    },
  })

  const command = parsed._[0] ?? ''
  const args = parsed._.slice(1)

  return {
    command,
    args,
    daemon: parsed.daemon,
    daemonInternal: parsed['daemon-internal'],
    port: parseInt(parsed.port, 10) || 3456,
    show: parsed.show,
    description: parsed.description,
    network: parsed.network as Network | undefined,
  }
}

export function printUsage(): void {
  console.log(USAGE)
}
