# Staging Testing Guide

This document describes how to test the mdk-checkout packages against the staging environment (`staging.moneydevkit.com`, running on signet/Mutinynet).

## Prerequisites

- A tunnel tool such as ngrok (`brew install ngrok` or https://ngrok.com) so staging can deliver webhooks to your machine
- Access to staging.moneydevkit.com (you authorize via a device flow during setup)
- This repo checked out (`mdk-checkout/` lives at the root of the lightning-node repo)

## Overview

To test packages against staging you need to:

1. Expose a local port via ngrok (so staging can send webhooks back)
2. Run the `@moneydevkit/create` CLI to get staging credentials
3. Configure the demo app with staging network settings
4. Run the demo app and test the checkout flow

## Step-by-Step Instructions

### 1. Start ngrok

Start ngrok to expose the port the demo app will run on:

```bash
ngrok http 3010
```

Copy the ngrok URL (e.g., `https://abc123.ngrok-free.dev`) — you'll need it for the create CLI.

### 2. Run the Create CLI for Staging Credentials

From `mdk-checkout/packages/create`, run the create CLI against staging:

```bash
cd mdk-checkout/packages/create

npx tsx src/index.ts \
  --base-url https://staging.moneydevkit.com \
  --webhook-url <YOUR_NGROK_URL> \
  --env-target <path-to>/.env.local \
  --project-name <name> \
  --no-clipboard
```

For the demo app in this repo, point `--env-target` at `mdk-checkout/examples/mdk-nextjs-demo/.env.local`.

This will:

- Display a device code (e.g., `9S4E-TRJ8`)
- Open an authorization page in your browser
- Wait for you to authorize the device
- Write `MDK_ACCESS_TOKEN` and `MDK_MNEMONIC` to the env file

**Important flags** (see `parseFlags` in `mdk-checkout/packages/create/src/index.ts`):

- `--base-url https://staging.moneydevkit.com` — use the staging API (the CLI appends `/rpc` itself)
- `--webhook-url <ngrok-url>` — the public URL for webhooks
- `--env-target <path>` — path to the `.env.local` file to write
- `--project-name <name>` — display name for the created app (optional)
- `--scaffold-nextjs` — also scaffold Next.js files if needed (optional)
- `--no-open` — don't auto-open the browser (optional)
- `--no-clipboard` — don't copy to clipboard

### 3. Configure the Demo App for the Staging Network

After the CLI writes credentials, add the staging network configuration to the same `.env.local`:

```bash
# Written by the create CLI:
MDK_ACCESS_TOKEN=<your-access-token>
MDK_MNEMONIC=<your-mnemonic>

# Add these manually for staging/Mutinynet:
MDK_API_BASE_URL=https://staging.moneydevkit.com/rpc
MDK_NETWORK=signet
MDK_VSS_URL=https://vss.staging.moneydevkit.com/vss
MDK_ESPLORA_URL=https://mutinynet.com/api
MDK_RGS_URL=https://rgs.staging.moneydevkit.com/snapshot
MDK_LSP_NODE_ID=03fd9a377576df94cc7e458471c43c400630655083dee89df66c6ad38d1b7acffd
MDK_LSP_ADDRESS=lsp.staging.moneydevkit.com:9735
```

### 4. Run the Demo App

```bash
cd mdk-checkout/examples/mdk-nextjs-demo
npm run dev -- -p 3010
```

The app will be available at:

- Local: http://localhost:3010
- Public (via ngrok): your ngrok URL

### 5. Test the Checkout Flow

1. Open http://localhost:3010 in your browser
2. Click "Launch checkout"
3. Verify the checkout page loads with a Lightning invoice QR code
4. Check the browser dev tools Network tab — all `/api/mdk` requests should return 200

## Getting Signet Sats

Staging runs on signet (Mutinynet), so invoices are paid with real signet sats. The team-standard way to get them is `mutinynet-cli` (https://github.com/benthecarman/mutinynet-cli, install from the GitHub releases page):

- `mutinynet-cli login` — authenticates via a GitHub device flow (token lasts 31 days, saved to `~/.mutinynet/token`)
- `mutinynet-cli lightning <bolt11>` — pays a Lightning invoice from the faucet

The faucet limit is 1,000,000 sats per day.

## Staging Shopping E2E (unhuman + Ori)

The staging shopping flow is fully hosted — nobody needs to run these pieces locally:

- **staging.unhuman.shopping** — Vercel project that auto-deploys unhuman `master`. Real signet (Mutinynet) L402 invoices via staging.moneydevkit.com, with a Zinc **sandbox** key (orders go to Zinc's sandbox; no real money or retailer orders) and its own database branch.
- **Sandbox Ori** — a hosted Cloudflare worker reachable on the dev Linq iMessage line (see the Ori README for the number). It is pinned to shop on staging.unhuman.shopping and pays invoices from its own per-agent signet wallet against staging MDK.
- **staging.moneydevkit.com + vss.staging + lsp.staging** — the MDK staging stack documented above (signet LSP).

Canonical e2e: text Sandbox Ori on the dev line; it shops on staging.unhuman.shopping, pays real signet invoices from its wallet, and places Zinc sandbox orders. If its wallet needs funds it replies with a funding link — pay it with `mutinynet-cli lightning <bolt11>`.

**Runbooks:**

- unhuman side: `unhuman/README.md`, section "Shopping E2E: use staging first"
- Ori side: `open-money/packages/ori-cloudflare/README.md`, section "Shopping e2e against staging"

## Troubleshooting

### "Maximum 10 apps per organization" error

There is a known bug in the CLI device auth page that uses old single-app logic. If you hit this:

- Delete existing apps in the staging dashboard, OR
- Use a different organization

### Webhook delivery issues

- Ensure ngrok is running and the URL matches what you passed to `--webhook-url`
- Check that the demo app is running on the correct port (3010)

### Lightning node issues

- The embedded node needs time to sync with Mutinynet
- Check console logs for LDK errors
- Verify the LSP settings match the staging values above
