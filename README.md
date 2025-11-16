# Money Dev Kit Packages

This repository hosts multiple npm packages that power the Money Dev Kit developer experience.

## Packages
- `mdk-checkout` – Next.js checkout components and helpers located in `packages/mdk-checkout`.
- `create-moneydevkit` – Developer onboarding CLI located in `packages/create-moneydevkit`.

### mdk-checkout (Next.js integration)
Install the package inside your Next.js App Router project:

```bash
npm install mdk-checkout
```

Configure your `.env` with the credentials provided by the CLI:

```env
MDK_ACCESS_TOKEN=your_api_key_here
MDK_WEBHOOK_SECRET=your_webhook_key_here
MDK_MNEMONIC=your_mnemonic_here
```

#### 1. Trigger a checkout from a client component
```jsx
// app/page.js
"use client";

import { useCheckout } from "mdk-checkout";

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
import { Checkout } from "mdk-checkout";
import { use } from "react";

export default function CheckoutPage({ params }) {
  const { id } = use(params);
  return <Checkout id={id} />;
}
```

#### 3. Expose the unified Money Dev Kit endpoint
```js
// app/api/mdk/route.js
export { POST } from "mdk-checkout/server/route";
```

#### 4. Configure Next.js
```js
// next.config.js / next.config.mjs
import withMdkCheckout from "mdk-checkout/next-plugin";

export default withMdkCheckout({});
```

### create-moneydevkit CLI
Run `npx create-moneydevkit` from your project root to provision API keys, webhook secrets, and mnemonics. The CLI writes `.env.local` files that `mdk-checkout` consumes.

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
