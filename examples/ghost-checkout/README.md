# Ghost Checkout

Accept Lightning payments for your Ghost blog memberships.

## One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmoneydevkit%2Fmdk-checkout%2Ftree%2Fmdk-216%2Fexamples%2Fghost-checkout&env=MDK_ACCESS_TOKEN,MDK_MNEMONIC,GHOST_URL,GHOST_ADMIN_API_KEY&envDescription=MoneyDevKit%20and%20Ghost%20credentials&project-name=ghost-checkout&repository-name=ghost-checkout)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MDK_ACCESS_TOKEN` | Your MoneyDevKit access token |
| `MDK_MNEMONIC` | Your 12 or 24 word mnemonic for the Lightning wallet |
| `GHOST_URL` | Your Ghost site URL (e.g., `https://yourblog.ghost.io`) |
| `GHOST_ADMIN_API_KEY` | Ghost Admin API key (format: `id:secret`) |
| `SUCCESS_URL` | (Optional) Redirect URL after successful payment |

## How It Works

1. Generate a signed checkout URL using `createCheckoutUrl`
2. Add the URL to your Ghost site with a `data-mdk` attribute
3. JavaScript injects the member's email into the URL
4. When a user pays, their Ghost membership is automatically updated

## Ghost Setup

### Step 1: Add the script to Ghost

Go to **Settings > Code injection > Site Footer** and add:

```html
<script>
document.querySelectorAll('a[data-mdk]').forEach(function(el) {
  var member = window.__GHOST_MEMBER__;
  if (member && member.email) {
    el.href = el.href + '&customer=' + encodeURIComponent(JSON.stringify({email: member.email}));
  }
});
</script>
```

### Step 2: Generate a signed checkout URL

Use the `createCheckoutUrl` helper to generate a signed URL:

```typescript
import { createCheckoutUrl } from '@moneydevkit/ghost/server'

const url = createCheckoutUrl({
  type: 'AMOUNT',
  amount: 500, // $5.00
  currency: 'USD',
  metadata: {
    ghostTierId: 'your-ghost-tier-id',
    months: '1'
  }
})
```

### Step 3: Add the link to your Ghost post

In a Ghost post, add an HTML card with the signed URL:

```html
<a href="https://your-checkout.vercel.app/api/mdk?action=createCheckout&amount=500&..." data-mdk>
  Subscribe for $5/month via Lightning
</a>
```

The `data-mdk` attribute tells the script to inject the member's email.

## Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```
