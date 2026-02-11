# MDK Next.js Vercel Demo

A minimal App Router project that exercises `@moneydevkit/nextjs` on Vercel:

- `/` – launch a checkout with `useCheckout()`
- `/checkout/[id]` – render the hosted checkout component
- `/checkout/success` – verify payment with `useCheckoutSuccess()`
- `/api/mdk` – unified Money Dev Kit endpoint

## Run locally
1. Copy `.env.example` to `.env.local` and fill in your Money Dev Kit credentials.
2. Install dependencies and run dev server from the workspace root (mdk-checkout):
   ```bash
   pnpm install
   pnpm run build
   pnpm --filter mdk-nextjs-demo run dev
   ```
3. The button on the home page creates a checkout and redirects to `/checkout/<id>`.

## Build Docker image
From the workspace root (mdk-checkout):
```bash
docker build -f examples/mdk-nextjs-demo/Dockerfile -t mdk-nextjs-demo .
```

## Deploy with Vercel CLI
```bash
npx vercel pull --yes --environment=preview --cwd=examples/mdk-nextjs-demo
npx vercel build --cwd=examples/mdk-nextjs-demo
npx vercel deploy --prebuilt --cwd=examples/mdk-nextjs-demo
```

Make sure your Vercel project has the MDK_* secrets configured so the checkout can be created.
