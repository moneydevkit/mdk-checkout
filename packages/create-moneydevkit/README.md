# create-moneydevkit

Developer onboarding CLI for Money Dev Kit. This package publishes the interactive `npx create-moneydevkit` flow that provisions API keys, webhook secrets, and a Lightning mnemonic for local development.

## Local Development

```bash
npm install
npm run dev          # watch mode via tsup
npm run build        # produce dist/ bundle + types
npm run run:local    # talk to a dashboard at http://localhost:3900
```

## What the CLI does

1. Calls the MDK onboarding RPC to create a device/session code.
2. Launches the browser for sign-in (or prints the verification URL when `--no-open` or `--json` are supplied).
3. Polls until the dashboard authorises the device, then provisions an API key + webhook secret, and generates a mnemonic locally via `@moneydevkit/lightning-js`.
4. Shows an env diff, writes `.env.local` (or a user-specified file), and optionally copies secrets to the clipboard.

### Running headlessly (for LLMs/automation)

Manual mode still uses the device-auth flow—the only difference is that you reuse an *existing* dashboard session instead of waiting for a browser round trip. The steps are:

1. **Sign in via the dashboard UI** (browser) and keep the tab open.
2. **Copy the `better-auth.session_token` cookie** from your browser’s developer tools (Application → Storage → Cookies or the Network panel). Copy the full `name=value` pair.
3. **Pass that cookie to the CLI** using `--manual-login`. Example:

```bash
SESSION_COOKIE='better-auth.session_token=eyJhbGciOiJI...'

npx create-moneydevkit \
  --base-url http://localhost:3900 \
  --dir /tmp/mdk-demo \
  --env-file .env.local \
  --webhook-url https://example.com/api/mdk \
  --manual-login "$SESSION_COOKIE" \
  --json --no-open --no-clipboard
```

The CLI still requests a device code, immediately authorises it using the provided cookie, and emits a JSON payload containing the secrets plus the env-file path—no username/password ever touch the terminal.

## Flags

| Flag | Description |
| ---- | ----------- |
| `--base-url` | Override dashboard base URL (default `https://moneydevkit.com`). |
| `--dir` | Target project directory (defaults to `cwd`). |
| `--env-file` | Env file name (default `.env.local`). |
| `--project-name` | Friendly name used when minting the API key. |
| `--no-open` | Skip auto-opening the browser; prints the verification URL instead. |
| `--no-clipboard` | Do not place secrets on the clipboard. |
| `--json` | Emit JSON result payloads (no interactive prompts).
| `--manual-login "<cookie>"` | Use a pre-generated dashboard session cookie instead of device flow. |
| `--webhook-url "<url>"` | Provide the webhook URL when running in `--manual-login` or `--json` modes. |
| `--force-new-webhook` | Force creation of a new webhook even if one already exists for the URL. |

Manual login mode calls `POST /api/cli/device/authorize` with the supplied session cookie. When used with `--json`, pass `--webhook-url` to avoid interactive prompts.
