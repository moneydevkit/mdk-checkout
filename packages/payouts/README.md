# @moneydevkit/payouts

Secure programmatic Lightning payouts for MoneyDevKit.

## Architecture

Authorization and limit enforcement is handled **server-side by moneydevkit.com**. Payment execution happens **locally** via your Lightning node.

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Your Code     │         │  moneydevkit.com │         │  Lightning Node │
│                 │         │                  │         │                 │
│  payout({...}) ─┼────────►│ Validate secret  │         │                 │
│                 │         │ Check limits     │         │                 │
│                 │◄────────┼─ Authorized ─────│         │                 │
│                 │         │                  │         │                 │
│                 │─────────┼──────────────────┼────────►│ Execute payment │
│                 │◄────────┼──────────────────┼─────────│ Payment result  │
│                 │         │                  │         │                 │
│                 │────────►│ Report completion│         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## Installation

```bash
npm install @moneydevkit/payouts
```

## Configuration

Set the required environment variables:

```bash
# Required - Get from moneydevkit.com dashboard
MDK_PAYOUT_SECRET=your-payout-secret-from-moneydevkit

# Standard MDK config (same as checkout)
MDK_ACCESS_TOKEN=your-access-token
MDK_MNEMONIC=your-wallet-mnemonic

# Optional - local destination allowlist
MDK_PAYOUT_ALLOWED_DESTINATIONS=lno1...,*.wallet.com
```

Limits are configured on moneydevkit.com, not locally.

## Usage

### Basic Payout

```typescript
import { payout, getBalance } from '@moneydevkit/payouts'

// Check balance
const balance = await getBalance()
console.log(`Balance: ${balance.sats} sats (~$${balance.usd.toFixed(2)})`)

// Payout in sats
const result = await payout({
  destination: 'winner@wallet.com',
  amount: 1000,
  currency: 'sats',
  idempotencyKey: 'game-123-win',
})

if (result.success) {
  console.log('Paid:', result.paymentId, result.amountSats)
} else {
  console.error('Failed:', result.error?.message)
}
```

### Payout in USD

```typescript
const result = await payout({
  destination: 'winner@wallet.com',
  amount: 5.00,
  currency: 'usd', // Converted to sats by moneydevkit.com
  idempotencyKey: 'game-456-win',
})
// result.amountSats = actual sats paid based on current rate
```

### Supported Destinations

- **Lightning Address**: `user@domain.com`
- **BOLT12 Offer**: `lno1...`
- **BOLT11 Invoice**: `lnbc...`
- **LNURL**: `lnurl1...`

```typescript
// Auto-detect (recommended)
await payout({ destination: 'lno1qcp4...', ... })

// Explicit type
await payout({
  destination: { type: 'bolt12', offer: 'lno1qcp4...' },
  ...
})
```

### L402 / Agent Payments

#### Agent (paying for APIs)

```typescript
import { paidFetch } from '@moneydevkit/payouts'

// Handles 402 flow: get invoice -> pay -> retry with preimage
const response = await paidFetch('https://tool.replit.app/api/work', {
  method: 'POST',
  body: JSON.stringify(data),
  payment: { maxSats: 100 }, // Refuse to pay more
})
```

#### Tool Provider (receiving payments)

```typescript
import { createPaidEndpoint } from '@moneydevkit/payouts'

// In your API route (e.g., app/api/tool/route.ts)
export const POST = createPaidEndpoint({
  priceSats: 10,
  handler: async (req, { payment }) => {
    const body = await req.json()
    return Response.json(await doWork(body))
  },
})
```

### Callbacks

```typescript
const result = await payout({
  destination: 'user@wallet.com',
  amount: 1000,
  idempotencyKey: 'order-123',
  
  // Called BEFORE payment - return false to abort
  beforePayout: async (payment) => {
    return await checkApprovalSystem(payment)
  },
  
  // Called AFTER payment completes
  afterPayout: async (result) => {
    await logToDatabase(result)
  }
})
```

## Security Architecture

### Server-Side (moneydevkit.com)

- **Secret validation** - `MDK_PAYOUT_SECRET` is validated server-side
- **Spending limits** - Per-payment, hourly, and daily limits enforced atomically
- **Rate limiting** - Prevents request flooding
- **Idempotency** - Server tracks idempotency keys to prevent duplicates
- **Audit logging** - All payout attempts are logged

### Client-Side (this package)

- **Server-only enforcement** - Package cannot be used from browser
- **Destination allowlist** - Optional local allowlist via `MDK_PAYOUT_ALLOWED_DESTINATIONS`
- **Local idempotency cache** - Prevents duplicate local requests
- **Callbacks** - `beforePayout` / `afterPayout` hooks

### Why Authorization is Server-Side

1. **Atomic limit checks** - No race conditions from concurrent requests
2. **Tamper-proof** - Limits can't be bypassed by modifying local code
3. **Centralized tracking** - All usage tracked in one place
4. **Secret validation** - Invalid secrets rejected before any payment
5. **Audit trail** - Complete history of all payout attempts

## Error Handling

```typescript
import { 
  payout, 
  RateLimitExceededError,
  PerPaymentLimitExceededError,
  InsufficientBalanceError,
} from '@moneydevkit/payouts'

const result = await payout({ ... })

if (!result.success) {
  switch (result.error?.code) {
    case 'RATE_LIMIT_EXCEEDED':
      // Wait and retry after result.error.retryAfterMs
      break
    case 'PER_PAYMENT_LIMIT_EXCEEDED':
      // Amount too large
      break
    case 'INSUFFICIENT_BALANCE':
      // Not enough funds
      break
    case 'DESTINATION_NOT_ALLOWED':
      // Not in allowlist
      break
    case 'INVALID_SECRET':
      // MDK_PAYOUT_SECRET is invalid
      break
    default:
      console.error(result.error?.message)
  }
}
```

## Why a Separate Package?

This package is separate from `@moneydevkit/core` because:

1. **Explicit opt-in** - Users must consciously install and configure payouts
2. **Separate credentials** - Different secret from checkout, limiting blast radius  
3. **No accidental exposure** - Checkout routes can't trigger payouts
4. **Clear security boundary** - Easier to audit and reason about
5. **Different threat model** - Outbound payments need stricter controls than inbound

## Server API Requirements

This package expects the following endpoints on moneydevkit.com:

- `POST /payout/authorize` - Validate secret and check limits
- `POST /payout/complete` - Report payment completion
- `POST /payout/limits` - Get current limits and usage

These endpoints are authenticated via the `x-payout-secret` header.

## License

MIT
