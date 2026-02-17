# @moneydevkit/agent-wallet

Self-custodial Lightning wallet for AI agents. No API keys required.

## Quick Start

```bash
# Initialize wallet (generates mnemonic)
npx @moneydevkit/agent-wallet@latest init

# Get balance
npx @moneydevkit/agent-wallet@latest balance

# Create invoice
npx @moneydevkit/agent-wallet@latest receive 1000

# Pay someone
npx @moneydevkit/agent-wallet@latest send user@getalby.com 500
```

## How It Works

The CLI automatically starts a daemon on first command. The daemon:
- Runs a local HTTP server on `localhost:3456`
- Connects to MDK's Lightning infrastructure (LSP, VSS)
- Polls for incoming payments every 30 seconds (15-second polling windows)
- Persists payment history to `~/.mdk-wallet/`

No webhook endpoint needed - the daemon handles everything locally.

**Payment Reception**: Uses LSPS4 JIT channels. When you create an invoice, the LSP
holds incoming HTLCs and opens a channel when paid. The daemon polls periodically
to claim these payments.

## Commands

| Command | Description |
|---------|-------------|
| `init` | Generate mnemonic, create config |
| `init --show` | Show config (mnemonic redacted) |
| `init --network signet` | Initialize on signet testnet |
| `start` | Start the daemon |
| `balance` | Get balance in sats |
| `receive <amount>` | Generate invoice |
| `receive` | Generate variable-amount invoice |
| `receive <amount> --description "..."` | Invoice with custom description |
| `receive-bolt12` | Generate BOLT12 offer (variable amount) |
| `send <destination> [amount]` | Pay bolt11, bolt12, lnurl, or lightning address |
| `payments` | List payment history |
| `status` | Check if daemon is running |
| `restart` | Restart the daemon |
| `stop` | Stop the daemon |

**Note:** `init` will refuse to overwrite an existing wallet. To reinitialize:

```bash
# Stop the daemon first
npx @moneydevkit/agent-wallet@latest stop

# Delete the config (WARNING: this deletes your wallet - backup mnemonic first!)
rm -rf ~/.mdk-wallet

# Reinitialize
npx @moneydevkit/agent-wallet@latest init
```

## Output Format

All commands output JSON to stdout:

```bash
$ npx @moneydevkit/agent-wallet@latest balance
{"balance_sats":50000}

$ npx @moneydevkit/agent-wallet@latest receive 1000
{"invoice":"lnbc10n1...","payment_hash":"abc123...","expires_at":"2024-01-15T12:00:00.000Z"}

$ npx @moneydevkit/agent-wallet@latest send user@example.com 500
{"payment_hash":"def456..."}
```

Exit code 0 = success, 1 = error.

## Supported Destinations

The `send` command auto-detects the destination type:

- **Bolt11**: `lnbc...`, `lntb...`, `lntbs...`
- **Bolt12**: `lno...`
- **LNURL**: `lnurl...`
- **Lightning Address**: `user@domain.com`

Amount is optional for bolt11 invoices that include an amount.

## Configuration

Config stored in `~/.mdk-wallet/config.json`:

```json
{
  "mnemonic": "word word word ...",
  "network": "mainnet",
  "walletId": "uuid"
}
```

Environment overrides:
- `MDK_WALLET_MNEMONIC` - Override mnemonic
- `MDK_WALLET_NETWORK` - `mainnet` or `signet`
- `MDK_WALLET_PORT` - Server port (default: 3456)

## For AI Agents

This wallet is designed for AI agents that need to send and receive Lightning payments:

1. Run `init` once to set up the wallet
2. Save the mnemonic securely
3. Use CLI commands for all operations - outputs are JSON for easy parsing
4. Daemon auto-starts and handles payment polling

**Note**: Each command may take 3-10 seconds on first call as the node syncs with the network.

## Upgrading

```bash
# Stop the running daemon
npx @moneydevkit/agent-wallet@latest stop

# Run with @latest to pull the newest version
npx @moneydevkit/agent-wallet@latest start
```

Your wallet config and payment history in `~/.mdk-wallet/` are preserved across upgrades.

## Troubleshooting

If the wallet becomes unresponsive (commands hang or return no output), restart the daemon:

```bash
npx @moneydevkit/agent-wallet@latest restart
```

## Networks

- **mainnet** (default): Real Bitcoin Lightning Network
- **signet**: Mutinynet testnet for development

```bash
# Initialize on signet for testing
npx @moneydevkit/agent-wallet@latest init --network signet

# Or set via environment
MDK_WALLET_NETWORK=signet npx @moneydevkit/agent-wallet@latest init
```

The network is set at init time and stored in config. You cannot change networks without reinitializing.

## License

Apache-2.0
