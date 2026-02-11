import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CheckoutSchema,
  UnconfirmedCheckoutSchema,
  ConfirmedCheckoutSchema,
  PendingPaymentCheckoutSchema,
  PaymentReceivedCheckoutSchema,
  ExpiredCheckoutSchema,
} from '../../src/schemas/checkout'

const baseCheckoutData = {
  id: 'checkout_123',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  clientSecret: 'client_secret_123',
  organizationId: 'org_123',
  expiresAt: new Date('2024-01-01T01:00:00Z'),
  userMetadata: { userId: 'user_123' },
  customFieldData: null,
  currency: 'USD',
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
  providedAmount: null,
  totalAmount: null,
  discountAmount: null,
  netAmount: null,
  taxAmount: null,
  invoiceAmountSats: null,
  invoiceScid: null,
  btcPrice: null,
  invoice: null,
}

const mockProduct = {
  id: 'product_123',
  name: 'Test Product',
  description: 'A test product',
  recurringInterval: null,
  prices: [{
    id: 'price_123',
    amountType: 'FIXED' as const,
    priceAmount: 1000,
    currency: 'USD',
  }],
}

const mockInvoice = {
  invoice: 'lnbc123...',
  expiresAt: new Date('2024-01-01T01:00:00Z'),
  paymentHash: 'hash_123',
  amountSats: 1000,
  amountSatsReceived: null,
  currency: 'USD',
  fiatAmount: 10.00,
  btcPrice: 50000,
}

describe('CheckoutSchema', () => {
  describe('UnconfirmedCheckoutSchema', () => {
    it('should validate PRODUCTS checkout', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'UNCONFIRMED' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
      }

      const result = UnconfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should validate AMOUNT checkout', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'UNCONFIRMED' as const,
        type: 'AMOUNT' as const,
        providedAmount: 1000,
      }

      const result = UnconfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should validate TOP_UP checkout', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'UNCONFIRMED' as const,
        type: 'TOP_UP' as const,
      }

      const result = UnconfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should reject PRODUCTS checkout without products', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'UNCONFIRMED' as const,
        type: 'PRODUCTS' as const,
        products: [],
      }

      const result = UnconfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, false)
    })

    it('should reject AMOUNT checkout without providedAmount', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'UNCONFIRMED' as const,
        type: 'AMOUNT' as const,
      }

      const result = UnconfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, false)
    })
  })

  describe('ConfirmedCheckoutSchema', () => {
    const amountFields = {
      totalAmount: 1000,
      discountAmount: 0,
      netAmount: 1000,
      taxAmount: 0,
      invoiceAmountSats: 2000,
      btcPrice: 50000,
    }

    it('should validate PRODUCTS checkout with amount fields', () => {
      const checkout = {
        ...baseCheckoutData,
        ...amountFields,
        status: 'CONFIRMED' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
      }

      const result = ConfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should validate AMOUNT checkout with amount fields', () => {
      const checkout = {
        ...baseCheckoutData,
        ...amountFields,
        status: 'CONFIRMED' as const,
        type: 'AMOUNT' as const,
        providedAmount: 1000,
      }

      const result = ConfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should validate TOP_UP checkout without amount fields', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'CONFIRMED' as const,
        type: 'TOP_UP' as const,
      }

      const result = ConfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should reject CONFIRMED checkout without required amount fields', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'CONFIRMED' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
      }

      const result = ConfirmedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, false)
    })
  })

  describe('PendingPaymentCheckoutSchema', () => {
    const amountFields = {
      totalAmount: 1000,
      discountAmount: 0,
      netAmount: 1000,
      taxAmount: 0,
      invoiceAmountSats: 2000,
      btcPrice: 50000,
    }

    it('should validate PRODUCTS checkout with fixed amount invoice', () => {
      const checkout = {
        ...baseCheckoutData,
        ...amountFields,
        status: 'PENDING_PAYMENT' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
        invoice: mockInvoice,
      }

      const result = PendingPaymentCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should validate TOP_UP checkout with dynamic amount invoice', () => {
      const dynamicInvoice = {
        ...mockInvoice,
        amountSats: null,
        fiatAmount: null,
        btcPrice: null,
      }

      const checkout = {
        ...baseCheckoutData,
        status: 'PENDING_PAYMENT' as const,
        type: 'TOP_UP' as const,
        invoice: dynamicInvoice,
      }

      const result = PendingPaymentCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should reject PENDING_PAYMENT checkout without invoice', () => {
      const checkout = {
        ...baseCheckoutData,
        ...amountFields,
        status: 'PENDING_PAYMENT' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
      }

      const result = PendingPaymentCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, false)
    })
  })

  describe('PaymentReceivedCheckoutSchema', () => {
    const amountFields = {
      totalAmount: 1000,
      discountAmount: 0,
      netAmount: 1000,
      taxAmount: 0,
      invoiceAmountSats: 2000,
      btcPrice: 50000,
    }

    it('should validate PAYMENT_RECEIVED checkout with paid invoice', () => {
      const paidInvoice = {
        ...mockInvoice,
        amountSatsReceived: 2000,
      }

      const checkout = {
        ...baseCheckoutData,
        ...amountFields,
        status: 'PAYMENT_RECEIVED' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
        invoice: paidInvoice,
      }

      const result = PaymentReceivedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should reject PAYMENT_RECEIVED checkout without amountSatsReceived', () => {
      const checkout = {
        ...baseCheckoutData,
        ...amountFields,
        status: 'PAYMENT_RECEIVED' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
        invoice: mockInvoice,
      }

      const result = PaymentReceivedCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, false)
    })
  })

  describe('ExpiredCheckoutSchema', () => {
    it('should validate EXPIRED checkout', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'EXPIRED' as const,
        type: 'PRODUCTS' as const,
      }

      const result = ExpiredCheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })
  })

  describe('CheckoutSchema union', () => {
    it('should validate any valid checkout state', () => {
      const unconfirmedCheckout = {
        ...baseCheckoutData,
        status: 'UNCONFIRMED' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
      }

      const result = CheckoutSchema.safeParse(unconfirmedCheckout)
      assert.equal(result.success, true)
    })

    it('should reject invalid checkout data', () => {
      const invalidCheckout = {
        ...baseCheckoutData,
        status: 'INVALID_STATUS' as any,
      }

      const result = CheckoutSchema.safeParse(invalidCheckout)
      assert.equal(result.success, false)
    })

    it('should reject checkout with truly invalid state combination', () => {
      // PENDING_PAYMENT status without required invoice
      const inconsistentCheckout = {
        ...baseCheckoutData,
        status: 'PENDING_PAYMENT' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
        totalAmount: 1000,
        discountAmount: 0,
        netAmount: 1000,
        taxAmount: 0,
        invoiceAmountSats: 2000,
        btcPrice: 50000,
        // Missing required invoice field for PENDING_PAYMENT status
      }

      const result = CheckoutSchema.safeParse(inconsistentCheckout)
      assert.equal(result.success, false)
    })
  })

  describe('Field validation', () => {
    it('should validate email format in customer object', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'UNCONFIRMED' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
        customer: {
          name: null,
          email: 'invalid-email',
          externalId: null,
        },
      }

      const result = CheckoutSchema.safeParse(checkout)
      assert.equal(result.success, false)
    })

    it('should accept valid email format in customer object', () => {
      const checkout = {
        ...baseCheckoutData,
        status: 'UNCONFIRMED' as const,
        type: 'PRODUCTS' as const,
        products: [mockProduct],
        customer: {
          name: 'John Doe',
          email: 'test@example.com',
          externalId: null,
          plan: 'pro',
        },
      }

      const result = CheckoutSchema.safeParse(checkout)
      assert.equal(result.success, true)
    })

    it('should validate required fields', () => {
      const incompleteCheckout = {
        id: 'checkout_123',
        // Missing required fields
      }

      const result = CheckoutSchema.safeParse(incompleteCheckout)
      assert.equal(result.success, false)
    })
  })
})
