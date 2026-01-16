# Ghost Checkout

Accept Lightning payments for your Ghost blog memberships.

## One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmoneydevkit%2Fmdk-checkout%2Ftree%2Fmain%2Fexamples%2Fghost-checkout&env=MDK_ACCESS_TOKEN,MDK_MNEMONIC,GHOST_URL,GHOST_ADMIN_API_KEY&envDescription=MoneyDevKit%20and%20Ghost%20credentials&envLink=https%3A%2F%2Fdocs.moneydevkit.com%2Fghost&project-name=ghost-checkout&repository-name=ghost-checkout)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MDK_ACCESS_TOKEN` | Your MoneyDevKit access token |
| `MDK_MNEMONIC` | Your 12 or 24 word mnemonic for the Lightning wallet |
| `GHOST_URL` | Your Ghost site URL (e.g., `https://yourblog.ghost.io`) |
| `GHOST_ADMIN_API_KEY` | Ghost Admin API key (format: `id:secret`) |
| `SUCCESS_URL` | (Optional) Redirect URL after successful payment |

## How It Works

1. Create a checkout URL using the `createCheckoutUrl` function
2. Add the URL to your Ghost site as a payment link
3. When a user pays, their Ghost membership is automatically updated

## Usage on Ghost

Add payment links to your Ghost site:

```html
<a href="https://your-checkout.vercel.app/api/mdk?action=createCheckout&amount=500&currency=USD&metadata={%22ghostTierId%22:%22your-tier-id%22,%22months%22:%221%22}&signature=...">
  Subscribe for $5/month
</a>
```

Use the `createCheckoutUrl` helper to generate signed URLs server-side, or contact MoneyDevKit for a URL generator tool.

## Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```
