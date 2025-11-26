# @moneydevkit/create

Developer onboarding CLI for Money Dev Kit. This package publishes the interactive `npx @moneydevkit/create` flow that provisions API keys, webhook secrets, and a Lightning mnemonic for local development.

## Getting Started

1. Run `npx @moneydevkit/create@latest` from the root of your project. The CLI walks you through login, webhook verification, and writes your secrets to `.env.local` (or a path you pick) while also copying them to the clipboard by default.
2. If we detect a Next.js app (package.json `next` dependency, `next.config.*`, or an `app/` directory), we'll offer to install and scaffold `@moneydevkit/nextjs` for you.
3. Follow the prompts. When you reach your editor again, `MDK_ACCESS_TOKEN`, `MDK_WEBHOOK_SECRET`, and `MDK_MNEMONIC` are ready to go.

### Customize the flow with flags

Pass any of the options from the table below to skip prompts or run non-interactively (add `--json` for machine-readable output). Example:

```bash
npx @moneydevkit/create@latest \
  --dir ./apps/storefront \
  --env-target .env.production \
  --webhook-url https://example.com/webhooks/mdk \
  --project-name "Storefront" \
  --no-open --no-clipboard
```

### Manual login (optional)

You can reuse an existing dashboard session instead of waiting for device auth:

1. Sign into https://moneydevkit.com in the browser and keep the tab open.
2. Copy the `better-auth.session_token` cookie (`name=value`).
3. Run `npx @moneydevkit/create@latest --manual-login "better-auth.session_token=..." --webhook-url https://yourapp.com --no-open` (combine with `--json` for scripts).

The CLI still creates a device code but immediately authorises it using your cookie, then prints the same outputs as the interactive flow.

## What the CLI does

1. Calls the MDK onboarding RPC to create a device/session code.
2. Launches the browser for sign-in (or prints the verification URL when `--no-open` or `--json` are supplied).
3. Polls until the dashboard authorises the device, then provisions an API key + webhook secret, and generates a mnemonic locally via BIP-39.
4. Shows an env diff, writes `.env.local` (or a user-specified file), and optionally copies secrets to the clipboard.
5. Detects a Next.js app and (with your confirmation or `--scaffold-nextjs`) installs `@moneydevkit/nextjs`, wraps `next.config.*` with `withMdkCheckout`, and scaffolds the API route plus `/checkout/[id]` page without overwriting existing files.

## Next.js scaffolding

- Auto-detects Next.js via `package.json`, `next.config.*`, or `app/` directory. If found, you'll be prompted to install and scaffold `@moneydevkit/nextjs`. Requires Next.js 15+ (per SDK peer deps).
- `--scaffold-nextjs` forces the install/scaffold (useful for CI); if no Next.js app is found, the CLI prints a warning and skips.
- Always scaffolds App Router files (`app/api/mdk/route.(ts|js)` and `app/checkout/[id]/page.(tsx|js)`).
- Existing files are left untouched; `next.config.*` is backed up if we need to wrap it with `withMdkCheckout`.

## Flags

| Flag | Description |
| ---- | ----------- |
| `--base-url` | Override dashboard base URL (default `https://moneydevkit.com`). |
| `--dir` | Target project directory (defaults to `cwd`). |
| `--env-target` | Env file name (default `.env.local`). |
| `--project-name` | Friendly name used when minting the API key. |
| `--no-open` | Skip auto-opening the browser; prints the verification URL instead. |
| `--no-clipboard` | Do not place secrets on the clipboard. |
| `--json` | Emit JSON result payloads (no interactive prompts).
| `--manual-login "<cookie>"` | Use a pre-generated dashboard session cookie instead of device flow. |
| `--webhook-url "<url>"` | Provide the webhook URL when running in `--manual-login` or `--json` modes. |
| `--force-new-webhook` | Force creation of a new webhook even if one already exists for the URL. |
| `--scaffold-nextjs` | Force install + scaffold `@moneydevkit/nextjs` (warns and skips if no Next.js app is detected). |

Manual login mode calls `POST /api/cli/device/authorize` with the supplied session cookie. When used with `--json`, pass `--webhook-url` to avoid interactive prompts.

## Local Development

```bash
npm install
npm run dev          # watch mode via tsup
npm run build        # produce dist/ bundle + types
npm run run:local    # talk to a dashboard at http://localhost:3900
```

## Releasing to npm

1. Bump the version in `packages/create/package.json` (for example: `npm version 0.2.0 --workspace packages/create --no-git-tag-version`) and commit the resulting `package-lock.json` change.
2. Push the commit, then create a GitHub release (or annotated tag) named `create-vX.Y.Z` that matches the new version string.
3. The `publish-create` workflow will detect that tag, run the build, and execute `npm publish packages/create --access public` using trusted publishing.

Once that workflow succeeds, `npx @moneydevkit/create@latest` automatically downloads the freshly published build.
