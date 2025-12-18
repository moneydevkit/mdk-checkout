# Money Dev Kit Packages

This repository hosts multiple npm packages that power the Money Dev Kit developer experience.

## Packages
- `@moneydevkit/nextjs` – Next.js checkout components and helpers located in `packages/nextjs`.
- `@moneydevkit/create` – Developer onboarding CLI located in `packages/create`.

### @moneydevkit/nextjs (Next.js integration)
Install the package inside your Next.js App Router project:

```bash
npm install @moneydevkit/nextjs
```

Configure your `.env` with the credentials provided by the CLI (create an account at [moneydevkit.com](https://moneydevkit.com) **or** run `npx @moneydevkit/create` to generate credentials locally):

```env
MDK_ACCESS_TOKEN=your_api_key_here
MDK_MNEMONIC=your_mnemonic_here
```

#### 1. Trigger a checkout from a client component
```jsx
// app/page.js
"use client";

import { useCheckout } from "@moneydevkit/nextjs";

export default function HomePage() {
  const { navigate, isNavigating } = useCheckout();

  const handlePurchase = () => {
    navigate({
      prompt: "Describe the purchase shown to the buyer",
      amount: 500,
      currency: "USD",
      metadata: {
        successUrl: "/checkout/success",
      },
    });
  };

  return (
    <button onClick={handlePurchase} disabled={isNavigating}>
      {isNavigating ? "Creating checkout…" : "Buy now"}
    </button>
  );
}
```

#### 2. Render the hosted checkout page
```jsx
// app/checkout/[id]/page.js
"use client";
import { Checkout } from "@moneydevkit/nextjs";
import { use } from "react";

export default function CheckoutPage({ params }) {
  const { id } = use(params);
  return <Checkout id={id} />;
}
```

#### 3. Expose the unified Money Dev Kit endpoint
```js
// app/api/mdk/route.js
export { POST } from "@moneydevkit/nextjs/server/route";
```

#### 4. Configure Next.js
```js
// next.config.js / next.config.mjs
import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";

export default withMdkCheckout({});
```

### create CLI
Run `npx @moneydevkit/create` from your project root to provision API keys, webhook secrets, and mnemonics. The CLI writes `.env.local` files that `@moneydevkit/nextjs` consumes.

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
