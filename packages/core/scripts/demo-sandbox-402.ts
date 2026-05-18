/**
 * Demo: prints the actual 402 response shape produced by withPayment()
 * in both preview/sandbox mode and production mode, side by side.
 *
 * Uses the same module-mocking pattern as the unit tests, so it exercises
 * REAL src/mdk402/with-payment.ts code without needing a built/published
 * @moneydevkit/core, a merchant app, a Lightning node, or moneydevkit.com.
 *
 * Run:
 *   cd mdk-checkout/packages/core
 *   ./node_modules/.bin/tsx --tsconfig tsconfig.test.json \
 *       --experimental-test-module-mocks scripts/demo-sandbox-402.ts
 */
import { mock } from 'node:test'

const TEST_ACCESS_TOKEN = 'demo-access-token'
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const FAKE_NODE_ID = 'node-demo'
const FAKE_CHECKOUT_ID = 'checkout-demo'
const FAKE_PAYMENT_HASH = 'cc6075cf3b3e73beef337157cac5d833c565e0dc552ec27befe3d21decb2320d'
const FAKE_INVOICE = 'lnbcrt1u1p4qw7zgdemo_invoice_string_for_display_only'

function makeConfirmedCheckout(amountSats: number) {
  return {
    id: FAKE_CHECKOUT_ID,
    status: 'CONFIRMED' as const,
    type: 'AMOUNT' as const,
    invoiceAmountSats: amountSats,
    currency: 'SAT' as const,
    createdAt: new Date(),
    clientSecret: 'cs_demo',
    organizationId: 'org_demo',
    expiresAt: new Date(Date.now() + 900_000),
    userMetadata: null,
    customFieldData: null,
    allowDiscountCodes: false,
    requireCustomerData: null,
    successUrl: null,
    customer: null,
    customerBillingAddress: null,
    products: null,
    productId: null,
    productPriceId: null,
    customAmount: null,
    product: null,
    providedAmount: amountSats,
    totalAmount: amountSats,
    discountAmount: 0,
    netAmount: amountSats,
    taxAmount: 0,
    btcPrice: 50000,
    invoiceScid: null,
    invoice: null,
  }
}

function makePendingCheckout(amountSats: number) {
  return {
    ...makeConfirmedCheckout(amountSats),
    status: 'PENDING_PAYMENT' as const,
    invoice: {
      invoice: FAKE_INVOICE,
      paymentHash: FAKE_PAYMENT_HASH,
      amountSats,
      amountSatsReceived: null,
      expiresAt: new Date(Date.now() + 900_000),
      currency: 'SAT' as const,
      fiatAmount: amountSats,
      btcPrice: 50000,
    },
  }
}

const fakeClient = {
  checkouts: {
    create: async () => makeConfirmedCheckout(100),
    mintInvoice: async () => makePendingCheckout(100),
    redeemL402: async () => ({ redeemed: true }),
    checkL402: async () => ({ redeemed: false }),
  },
}

// Module-level toggle the preview mock reads each call.
let previewMode = false

mock.module('../src/mdk', {
  namedExports: {
    createMoneyDevKitClient: () => fakeClient,
    deriveNodeIdFromConfig: () => FAKE_NODE_ID,
    resolveMoneyDevKitOptions: () => ({
      accessToken: TEST_ACCESS_TOKEN,
      mnemonic: TEST_MNEMONIC,
      baseUrl: 'http://localhost:3000',
    }),
  },
})

mock.module('../src/preview', {
  namedExports: {
    is_preview_environment: () => previewMode,
  },
})

process.env.MDK_ACCESS_TOKEN = TEST_ACCESS_TOKEN
process.env.MDK_MNEMONIC = TEST_MNEMONIC

const { withPayment } = await import('../src/mdk402/with-payment')

async function dump(label: string, preview: boolean) {
  previewMode = preview
  const wrapped = withPayment({ amount: 100, currency: 'SAT' }, async () =>
    Response.json({ secret: 'data' }),
  )
  const res = await wrapped(new Request('http://localhost/api/premium/pairing'))

  console.log('\n' + '='.repeat(78))
  console.log(`${label}  (is_preview_environment() => ${preview})`)
  console.log('='.repeat(78))
  console.log(`HTTP ${res.status}`)
  for (const [k, v] of res.headers.entries()) {
    console.log(`${k}: ${v}`)
  }
  console.log('')
  console.log(await res.text())
}

await dump('PRODUCTION 402 (current behavior, unchanged)', false)
await dump('SANDBOX 402 (new behavior - three signals)', true)
