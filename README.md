# Money Dev Kit Packages

This repository now hosts multiple npm packages that power the Money Dev Kit developer experience.

## Packages
- `mdk-checkout` – Next.js checkout components and helpers (located in `packages/mdk-checkout`).
- `create-moneydevkit` – Developer onboarding CLI (`packages/create-moneydevkit`).

## Workspace scripts
Run commands from the repo root using npm workspaces:

```bash
npm install               # install all package deps
npm run build             # build every package
npm run test -- --watch   # pass flags through to workspace scripts
npm run build -w mdk-checkout
npm run build -w create-moneydevkit
```

To work on an individual package, `cd` into its folder under `packages/` and run the usual commands (e.g., `npm run dev`).
