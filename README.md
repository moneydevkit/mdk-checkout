# mdk-checkout

Money Dev Kit checkout components, providers, and server helpers for embedding Lightning-based checkout flows into Next.js applications.

## Installation & Setup

Before using this library, you need to:

1. **Get API credentials**: Go to [moneydevkit.com](https://moneydevkit.com), create an account, and obtain your `api_key` and `webhook_key`.

2. **Install the package**:
```bash
npm install mdk-checkout
```

3. **Configure environment variables** in your `.env` file:
```env
MDK_ACCESS_TOKEN=your_api_key_here
MDK_WEBHOOK_SECRET=your_webhook_key_here
MDK_MNEMONIC=your_mnemonic_here  # Optional: for advanced configurations
```

## Quick Start

### 1. Import Styles

Add the required CSS to your root layout:

```tsx
// app/layout.tsx
import "mdk-checkout/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
```

### 2. Create Checkouts

Use the server action to create lightning checkouts:

```tsx
// app/page.tsx
import { createCheckout } from "mdk-checkout/server";

export default function HomePage() {
  const handleCreateCheckout = async () => {
    const checkout = await createCheckout({
      prompt: "Custom AI image generation",
      amount: 500,        // Amount in cents (USD) or sats
      currency: "USD",    // or "SAT"
      metadata: {
        // Any additional metadata
        customField: "value"
      }
    });

    // Redirect to checkout page
    window.location.href = `/checkout/${checkout.id}`;
  };

  return (
    <button onClick={handleCreateCheckout}>
      Create Checkout
    </button>
  );
}
```

### 3. Display Checkout UI

Create a checkout page to display the Lightning payment interface:

```tsx
// app/checkout/[id]/page.tsx
import { Checkout } from "mdk-checkout";

export default async function CheckoutPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;

  return (
    <Checkout
      id={id}
      title="Your App Name"
      description="Complete your purchase"
      onSuccess={(checkout) => {
        // Handle successful payment
        console.log("Payment successful!", checkout);
      }}
    />
  );
}
```

### 4. Handle Webhooks

Create a webhook endpoint to receive payment notifications:

```tsx
// app/api/webhooks/mdk/route.ts
export { POST } from "mdk-checkout/server/webhooks";
```

## API Reference

### `createCheckout(params)`

Creates a new Lightning checkout session.

**Parameters:**
- `params.prompt: string` - Description of the purchase
- `params.amount?: number` - Amount in cents (USD) or satoshis (SAT). Default: 200
- `params.currency?: 'USD' | 'SAT'` - Currency type. Default: 'USD'
- `params.metadata?: Record<string, any>` - Additional metadata

**Legacy support:** You can also pass just a string for the prompt (backward compatible).

### `<Checkout>` Component

Main checkout component that handles the Lightning payment flow.

**Props:**
- `id: string` - Checkout ID from `createCheckout`
- `title?: string` - Checkout page title
- `description?: string` - Checkout description
- `onSuccess?: (checkout) => void` - Callback when payment succeeds


## Complete Example

Here's a full example showing all the pieces together:

```tsx
// app/layout.tsx
import "mdk-checkout/globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

// app/page.tsx
import { createCheckout } from "mdk-checkout/server";
import { redirect } from "next/navigation";

export default function HomePage() {
  async function handleCreateCheckout(formData: FormData) {
    "use server";

    const description = formData.get("description") as string;

    const checkout = await createCheckout({
      prompt: description,
      amount: 300, // $3.00
      currency: "USD"
    });

    redirect(`/checkout/${checkout.id}`);
  }

  return (
    <form action={handleCreateCheckout}>
      <textarea
        name="description"
        placeholder="Describe what you want to purchase..."
        required
      />
      <button type="submit">Create Checkout</button>
    </form>
  );
}

// app/checkout/[id]/page.tsx
import { Checkout } from "mdk-checkout";

export default async function CheckoutPage({ params }) {
  const { id } = await params;
  return <Checkout id={id} title="My App" />;
}

// app/api/webhooks/mdk/route.ts
export { POST } from "mdk-checkout/server/webhooks";
```


## Environment Variables

Required environment variables:

- `MDK_ACCESS_TOKEN` - Your Money Dev Kit API key
- `MDK_WEBHOOK_SECRET` - Your webhook secret key
- `MDK_MNEMONIC` - Your wallet mnemonic (optional)

## Development

```bash
npm install
npm run build
npm run typecheck
```

Use `npm link` or `npm pack` to integrate locally, or publish to npm.
