import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CheckoutSchema,
  contract,
  type CreateCheckout,
  type ConfirmCheckout,
  type RegisterInvoice,
  type PaymentReceived,
  type Checkout,
} from '../src/index'

describe('API Contract Index', () => {
  describe('Exports', () => {
    it('should export CheckoutSchema', () => {
      assert.ok(CheckoutSchema)
      assert.equal(typeof CheckoutSchema.parse, 'function')
    })

    it('should export contract object', () => {
      assert.ok(contract)
      assert.ok(contract.checkout)
    })

    it('should export checkout contract methods', () => {
      assert.ok(contract.checkout.get)
      assert.ok(contract.checkout.create)
      assert.ok(contract.checkout.confirm)
      assert.ok(contract.checkout.registerInvoice)
      assert.ok(contract.checkout.paymentReceived)
    })
  })

  describe('Schema functionality', () => {
    it('CheckoutSchema should validate valid checkout data', () => {
      const validCheckout = {
        id: 'checkout_123',
        createdAt: new Date(),
        clientSecret: 'secret_123',
        type: 'PRODUCTS' as const,
        status: 'UNCONFIRMED' as const,
        organizationId: 'org_123',
        expiresAt: new Date(),
        userMetadata: null,
        customFieldData: null,
        currency: 'USD',
        allowDiscountCodes: false,
        requireCustomerData: null,
        successUrl: null,
        customer: null,
        customerBillingAddress: null,
        products: [{
          id: 'product_123',
          name: 'Test Product',
          description: null,
          recurringInterval: null,
          prices: [{
            id: 'price_123',
            amountType: 'FIXED' as const,
            priceAmount: 1000,
            currency: 'USD',
          }],
        }],
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

      const result = CheckoutSchema.safeParse(validCheckout)
      assert.equal(result.success, true)
    })

    it('CheckoutSchema should reject invalid checkout data', () => {
      const invalidCheckout = {
        id: 'checkout_123',
        // Missing required fields
      }

      const result = CheckoutSchema.safeParse(invalidCheckout)
      assert.equal(result.success, false)
    })
  })

  describe('Contract functionality', () => {
    it('should have all expected contract methods defined', () => {
      assert.ok(contract.checkout.create)
      assert.ok(contract.checkout.get)
      assert.ok(contract.checkout.confirm)
      assert.ok(contract.checkout.registerInvoice)
      assert.ok(contract.checkout.paymentReceived)
    })

    it('contracts should be ORPC contract instances', () => {
      // These are ORPC contracts created with oc.input().output()
      assert.equal(typeof contract.checkout.create, 'object')
      assert.equal(typeof contract.checkout.get, 'object')
      assert.equal(typeof contract.checkout.confirm, 'object')
      assert.equal(typeof contract.checkout.registerInvoice, 'object')
      assert.equal(typeof contract.checkout.paymentReceived, 'object')
    })
  })

  describe('Type exports', () => {
    it('should be able to use exported types', () => {
      // This test ensures that the types are properly exported and can be used
      const createCheckout: CreateCheckout = {
        nodeId: 'node_123',
        amount: 1000,
        currency: 'USD',
        customerEmail: 'test@example.com',
      }

      const confirmCheckout: ConfirmCheckout = {
        checkoutId: 'checkout_123',
        customerName: 'John Doe',
      }

      const registerInvoice: RegisterInvoice = {
        nodeId: 'node_123',
        scid: 'scid_123',
        checkoutId: 'checkout_123',
        invoice: 'lnbc123...',
        paymentHash: 'hash123',
        invoiceExpiresAt: new Date(),
      }

      const paymentReceived: PaymentReceived = {
        payments: [{
          paymentHash: 'hash123',
          amountSats: 1500,
        }],
      }

      // Basic type checks - these should not throw TypeScript errors
      assert.equal(typeof createCheckout.amount, 'number')
      assert.equal(typeof confirmCheckout.checkoutId, 'string')
      assert.equal(typeof registerInvoice.invoice, 'string')
      assert.equal(typeof paymentReceived.payments[0].amountSats, 'number')
    })
  })

  describe('Integration', () => {
    it('should work together as a complete API contract', () => {
      // Test that we can create type-safe input objects that match the contract requirements

      // 1. Create valid input objects
      const createInput: CreateCheckout = {
        nodeId: 'node_123',
        amount: 1000,
        currency: 'USD',
        products: ['product_1'],
        customerEmail: 'test@example.com',
      }

      const confirmInput: ConfirmCheckout = {
        checkoutId: 'checkout_123',
        customerName: 'John Doe',
      }

      const registerInput: RegisterInvoice = {
        nodeId: 'node_123',
        scid: 'scid_123',
        checkoutId: 'checkout_123',
        invoice: 'lnbc123...',
        paymentHash: 'hash123',
        invoiceExpiresAt: new Date(),
      }

      const paymentInput: PaymentReceived = {
        payments: [{
          paymentHash: 'hash123',
          amountSats: 1500,
        }],
      }

      // 2. Verify types are consistent with contracts
      assert.equal(typeof createInput.amount, 'number')
      assert.equal(typeof confirmInput.checkoutId, 'string')
      assert.equal(typeof registerInput.invoice, 'string')
      assert.equal(typeof paymentInput.payments[0].amountSats, 'number')

      // 3. Verify contracts exist and are properly structured
      assert.ok(contract.checkout.create)
      assert.ok(contract.checkout.confirm)
      assert.ok(contract.checkout.registerInvoice)
      assert.ok(contract.checkout.paymentReceived)
    })
  })
})
