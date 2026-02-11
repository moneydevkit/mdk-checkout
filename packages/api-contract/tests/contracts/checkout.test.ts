import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkout,
  CreateCheckoutInputSchema,
  ConfirmCheckoutInputSchema,
  ApplyDiscountCodeInputSchema,
  RegisterInvoiceInputSchema,
  PaymentReceivedInputSchema,
  GetCheckoutInputSchema,
} from '../../src/contracts/checkout'
import { CheckoutSchema } from '../../src/schemas/checkout'

describe('Checkout Contracts', () => {
  describe('Contract Structure', () => {
    it('should have all expected contract methods', () => {
      assert.ok(checkout.get)
      assert.ok(checkout.create)
      assert.ok(checkout.confirm)
      assert.ok(checkout.registerInvoice)
      assert.ok(checkout.paymentReceived)
    })

    it('should export contracts as ORPC contract objects', () => {
      // These are ORPC contracts created with oc.input().output()
      assert.equal(typeof checkout.get, 'object')
      assert.equal(typeof checkout.create, 'object')
      assert.equal(typeof checkout.confirm, 'object')
      assert.equal(typeof checkout.registerInvoice, 'object')
      assert.equal(typeof checkout.paymentReceived, 'object')
    })

    it('should export input schemas separately for direct validation', () => {
      // Test that the individual input schemas are available for direct use
      assert.ok(CreateCheckoutInputSchema)
      assert.ok(ConfirmCheckoutInputSchema)
      assert.ok(ApplyDiscountCodeInputSchema)
      assert.ok(RegisterInvoiceInputSchema)
      assert.ok(PaymentReceivedInputSchema)
      assert.ok(GetCheckoutInputSchema)
    })

    it('should export CheckoutSchema for output validation', () => {
      assert.ok(CheckoutSchema)
      assert.equal(typeof CheckoutSchema.parse, 'function')
    })
  })

  describe('CreateCheckoutInputSchema', () => {
    it('should validate minimal create checkout input', () => {
      const input = {
        nodeId: 'node_123',
      }
      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should validate create checkout input with all fields', () => {
      const input = {
        nodeId: 'node_123',
        amount: 1000,
        currency: 'USD',
        products: ['product_1', 'product_2'],
        successUrl: 'https://example.com/success',
        allowDiscountCodes: true,
        metadata: { orderId: 'order_123' },
        customer: {
          name: 'John Doe',
          email: 'john@example.com',
          plan: 'pro',
        },
        requireCustomerData: ['email', 'name'],
      }

      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should validate requireCustomerData with just email', () => {
      const input = {
        nodeId: 'node_123',
        requireCustomerData: ['email'],
      }

      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should validate requireCustomerData with custom field', () => {
      const input = {
        nodeId: 'node_123',
        requireCustomerData: ['email', 'company'],
        customer: {
          email: 'john@example.com',
          company: 'Acme Inc',
        },
      }

      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should accept any non-empty string in requireCustomerData (custom fields)', () => {
      const input = {
        nodeId: 'node_123',
        requireCustomerData: ['email', 'company', 'billingAddress'],
      }

      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should reject empty string in requireCustomerData', () => {
      const input = {
        nodeId: 'node_123',
        requireCustomerData: ['email', ''],
      }

      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should reject invalid email format in customer', () => {
      const input = {
        nodeId: 'node_123',
        customer: {
          email: 'invalid-email',
        },
      }

      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should transform empty string for customer name to undefined', () => {
      const input = {
        nodeId: 'node_123',
        customer: {
          name: '',
        },
      }

      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.customer?.name, undefined)
      }
    })

    it('should validate create checkout with customer custom fields', () => {
      const input = {
        nodeId: 'node_123',
        customer: {
          userId: 'user_123',
          plan: 'pro',
          accountRef: 'acct_456',
        },
      }

      const result = CreateCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should only accept string values in custom fields', () => {
      const validInput = {
        nodeId: 'node_123',
        customer: {
          userId: 'user_123',
          company: 'Acme Inc',
        },
      }

      const invalidInput = {
        nodeId: 'node_123',
        customer: {
          userId: 'user_123',
          count: 42, // numbers not allowed
        },
      }

      assert.equal(CreateCheckoutInputSchema.safeParse(validInput).success, true)
      assert.equal(CreateCheckoutInputSchema.safeParse(invalidInput).success, false)
    })

  })

  describe('ConfirmCheckoutInputSchema', () => {
    it('should validate minimal confirm checkout input', () => {
      const input = {
        checkoutId: 'checkout_123',
      }

      const result = ConfirmCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should validate confirm checkout input with all fields', () => {
      const input = {
        checkoutId: 'checkout_123',
        customer: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        products: [
          {
            productId: 'product_1',
            priceAmount: 500,
          },
        ],
      }

      const result = ConfirmCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should reject confirm checkout without checkoutId', () => {
      const input = {
        customer: {
          name: 'John Doe',
        },
      }

      const result = ConfirmCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should validate products array with optional priceAmount', () => {
      const input = {
        checkoutId: 'checkout_123',
        products: [
          { productId: 'product_1', priceAmount: 1000 },
        ],
      }

      const result = ConfirmCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should reject products array with more than 1 item', () => {
      const input = {
        checkoutId: 'checkout_123',
        products: [
          { productId: 'product_1' },
          { productId: 'product_2' },
        ],
      }

      const result = ConfirmCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should accept custom fields from confirm input (form fields)', () => {
      // Custom fields are accepted at confirm time - they come from the form
      const input = {
        checkoutId: 'checkout_123',
        customer: {
          name: 'John Doe',
          billingAddress: '123 Main St',
          planId: 'pro',
        },
      }

      const result = ConfirmCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
      if (result.success) {
        assert.ok('name' in result.data.customer!)
        assert.ok('billingAddress' in result.data.customer!)
        assert.ok('planId' in result.data.customer!)
      }
    })
  })

  describe('ApplyDiscountCodeInputSchema', () => {
    it('should validate apply discount code input', () => {
      const input = {
        checkoutId: 'checkout_123',
        discountCode: 'SAVE20',
      }

      const result = ApplyDiscountCodeInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should reject without checkoutId', () => {
      const input = {
        discountCode: 'SAVE20',
      }

      const result = ApplyDiscountCodeInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should reject without discountCode', () => {
      const input = {
        checkoutId: 'checkout_123',
      }

      const result = ApplyDiscountCodeInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })
  })

  describe('RegisterInvoiceInputSchema', () => {
    it('should validate register invoice input', () => {
      const input = {
        checkoutId: 'checkout_123',
        nodeId: 'node_123',
        scid: '1x0x0',
        invoice: 'lnbc1500n1pdn4czkpp5ugdqer05qrrxuchrzkcue94th9w2xzasp9qm7d0yqcgqv5p3qjnjn',
        paymentHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        invoiceExpiresAt: new Date('2024-01-01T01:00:00Z'),
      }

      const result = RegisterInvoiceInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should reject without required fields', () => {
      const input = {
        checkoutId: 'checkout_123',
        // Missing invoice, paymentHash, invoiceExpiresAt
      }

      const result = RegisterInvoiceInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should reject invalid date for invoiceExpiresAt', () => {
      const input = {
        checkoutId: 'checkout_123',
        invoice: 'lnbc1500n1...',
        paymentHash: 'hash123',
        invoiceExpiresAt: 'not-a-date',
      }

      const result = RegisterInvoiceInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })
  })

  describe('PaymentReceivedInputSchema', () => {
    it('should validate payment received input', () => {
      const input = {
        payments: [{
        paymentHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        amountSats: 1500,
        }],
      }

      const result = PaymentReceivedInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should allow sandbox flag on payment', () => {
      const input = {
        payments: [{
          paymentHash: 'hash-sandbox',
          amountSats: 1500,
          sandbox: true,
        }],
      }

      const result = PaymentReceivedInputSchema.safeParse(input)
      assert.equal(result.success, true)
      assert.equal(result.success && result.data.payments[0]?.sandbox, true)
    })

    it('should reject without paymentHash', () => {
      const input = {
        amountSats: 1500,
      }

      const result = PaymentReceivedInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should reject without amountSats', () => {
      const input = {
        paymentHash: 'hash123',
      }

      const result = PaymentReceivedInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should reject non-number amountSats', () => {
      const input = {
        paymentHash: 'hash123',
        amountSats: 'not-a-number',
      }

      const result = PaymentReceivedInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })
  })

  describe('GetCheckoutInputSchema', () => {
    it('should validate get checkout input', () => {
      const input = {
        id: 'checkout_123',
      }

      const result = GetCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, true)
    })

    it('should reject without id', () => {
      const input = {}

      const result = GetCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })

    it('should reject non-string id', () => {
      const input = {
        id: 123,
      }

      const result = GetCheckoutInputSchema.safeParse(input)
      assert.equal(result.success, false)
    })
  })

  describe('Type consistency', () => {
    it('should have consistent types between input schemas and exported types', () => {
      // This test ensures that the exported types match the actual schemas
      const createInput = {
        nodeId: 'node_123',
        amount: 1000,
        currency: 'USD',
        customerEmail: 'test@example.com',
      }

      const confirmInput = {
        checkoutId: 'checkout_123',
        customerName: 'John Doe',
      }

      const registerInput = {
        checkoutId: 'checkout_123',
        nodeId: 'node_123',
        scid: '1x0x0',
        invoice: 'lnbc123...',
        paymentHash: 'hash123',
        invoiceExpiresAt: new Date(),
      }

      const paymentInput = {
        payments: [{
        paymentHash: 'hash123',
        amountSats: 1500,
        }],
      }

      // These should all parse successfully
      assert.equal(CreateCheckoutInputSchema.safeParse(createInput).success, true)
      assert.equal(ConfirmCheckoutInputSchema.safeParse(confirmInput).success, true)
      assert.equal(RegisterInvoiceInputSchema.safeParse(registerInput).success, true)
      assert.equal(PaymentReceivedInputSchema.safeParse(paymentInput).success, true)
    })
  })
})
