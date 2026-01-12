# Money Dev Kit Packages

This repository hosts multiple npm packages that power the Money Dev Kit developer experience.

## Packages
- `@moneydevkit/nextjs` – Next.js checkout components and helpers located in `packages/nextjs`.
- `@moneydevkit/create` – Developer onboarding CLI located in `packages/create`.

## Workspace scripts
Run commands from the repo root using npm workspaces:

```bash
npm install               # install all package deps
npm run build             # build every package
npm run test -- --watch   # pass flags through to workspace scripts
npm run build -w @moneydevkit/nextjs
npm run build -w create
```

To work on an individual package, `cd` into its folder under `packages/` and run the usual commands (e.g., `npm run dev`).

## Releasing

All `@moneydevkit/*` packages share a unified version number and are released together.

### Beta releases (automatic)

Every push to `main` that modifies files in `packages/` triggers the `publish-beta` workflow:
1. All packages are bumped to the next beta version (e.g., `0.4.0-beta.0` → `0.4.0-beta.1`)
2. All packages are published to npm with the `beta` tag

Install the latest beta with:
```bash
npx @moneydevkit/create@beta
npm install @moneydevkit/nextjs@beta
```

### Stable releases

1. Create a GitHub release with a tag matching the version in package.json (e.g., if package.json has `0.4.0-beta.3`, create tag `v0.4.0`)
2. The `publish-release` workflow validates, publishes, and bumps to the next minor version

### Version flow example

```
0.4.0           ← initial version in package.json
    ↓ push to main
0.4.0-beta.0    ← publish-beta.yml
    ↓ push to main
0.4.0-beta.1    ← publish-beta.yml
    ↓ push to main
0.4.0-beta.2    ← publish-beta.yml
    ↓ gh release create v0.4.0
0.4.0 @latest   ← publish-release.yml (publishes stable)
0.5.0           ← publish-release.yml (auto-bumps to next minor)
    ↓ push to main
0.5.0-beta.0    ← publish-beta.yml
...
```

### Error cases

```
package.json: 0.4.0-beta.2
    ↓ gh release create v0.3.0
ERROR: Tag version 0.3.0 does not match package.json version 0.4.0
       (cannot release older version)

package.json: 0.4.0-beta.2
    ↓ gh release create v0.5.0
ERROR: Tag version 0.5.0 does not match package.json version 0.4.0
       (must release 0.4.0 first, then betas will be 0.5.0-beta.X)

package.json: 0.4.0-beta.2
    ↓ gh release create v0.4.0
SUCCESS: Publishes 0.4.0, then bumps to 0.5.0
```
.
