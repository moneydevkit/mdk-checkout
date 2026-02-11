import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CheckoutProductSchema,
  CheckoutProductPriceSchema,
} from '../../src/schemas/product'

const baseProductPriceData = {
  id: 'price_123',
  amountType: 'FIXED' as const,
  priceAmount: null,
  currency: 'USD',
}

const baseProductData = {
  id: 'product_123',
  name: 'Test Product',
  description: null,
  recurringInterval: null,
  prices: [baseProductPriceData],
}

describe('Product Schemas', () => {
  describe('CheckoutProductPriceSchema', () => {
    it('should validate price with FIXED amount type', () => {
      const fixedPrice = {
        ...baseProductPriceData,
        amountType: 'FIXED' as const,
        priceAmount: 999,
      }

      const result = CheckoutProductPriceSchema.safeParse(fixedPrice)
      assert.equal(result.success, true)
    })

    it('should validate price with CUSTOM amount type', () => {
      const customPrice = {
        ...baseProductPriceData,
        amountType: 'CUSTOM' as const,
        priceAmount: null,
      }

      const result = CheckoutProductPriceSchema.safeParse(customPrice)
      assert.equal(result.success, true)
    })

    it('should reject FREE amount type (not supported)', () => {
      const freePrice = {
        ...baseProductPriceData,
        amountType: 'FREE' as const,
        priceAmount: 0,
      }

      const result = CheckoutProductPriceSchema.safeParse(freePrice)
      assert.equal(result.success, false)
    })

    it('should reject METERED amount type (not supported)', () => {
      const meteredPrice = {
        ...baseProductPriceData,
        amountType: 'METERED' as const,
      }

      const result = CheckoutProductPriceSchema.safeParse(meteredPrice)
      assert.equal(result.success, false)
    })

    it('should reject invalid amount type', () => {
      const invalidPrice = {
        ...baseProductPriceData,
        amountType: 'INVALID_TYPE' as any,
      }

      const result = CheckoutProductPriceSchema.safeParse(invalidPrice)
      assert.equal(result.success, false)
    })

    it('should reject price without required id', () => {
      const priceWithoutId = {
        ...baseProductPriceData,
        id: undefined,
      }

      const result = CheckoutProductPriceSchema.safeParse(priceWithoutId)
      assert.equal(result.success, false)
    })

    it('should allow null priceAmount', () => {
      const priceWithNull = {
        ...baseProductPriceData,
        priceAmount: null,
      }

      const result = CheckoutProductPriceSchema.safeParse(priceWithNull)
      assert.equal(result.success, true)
    })

    it('should reject non-number values for priceAmount', () => {
      const invalidPrice = {
        ...baseProductPriceData,
        priceAmount: 'not-a-number',
      }

      const result = CheckoutProductPriceSchema.safeParse(invalidPrice)
      assert.equal(result.success, false)
    })
  })

  describe('CheckoutProductSchema', () => {
    it('should validate product with basic information', () => {
      const result = CheckoutProductSchema.safeParse(baseProductData)
      assert.equal(result.success, true)
    })

    it('should validate product with description', () => {
      const productWithDescription = {
        ...baseProductData,
        description: 'This is a test product description',
      }

      const result = CheckoutProductSchema.safeParse(productWithDescription)
      assert.equal(result.success, true)
    })

    it('should validate product with recurring interval', () => {
      const recurringProduct = {
        ...baseProductData,
        recurringInterval: 'MONTH' as const,
      }

      const result = CheckoutProductSchema.safeParse(recurringProduct)
      assert.equal(result.success, true)
    })

    it('should validate all recurring interval options', () => {
      const intervals = ['MONTH', 'QUARTER', 'YEAR'] as const

      intervals.forEach((interval) => {
        const product = {
          ...baseProductData,
          recurringInterval: interval,
        }

        const result = CheckoutProductSchema.safeParse(product)
        assert.equal(result.success, true)
      })
    })

    it('should validate product with a custom price', () => {
      const productWithCustomPrice = {
        ...baseProductData,
        prices: [
          {
            ...baseProductPriceData,
            id: 'price_2',
            amountType: 'CUSTOM' as const,
            priceAmount: null,
          },
        ],
      }

      const result = CheckoutProductSchema.safeParse(productWithCustomPrice)
      assert.equal(result.success, true)
    })

    it('should reject product without required id', () => {
      const productWithoutId = {
        ...baseProductData,
        id: undefined,
      }

      const result = CheckoutProductSchema.safeParse(productWithoutId)
      assert.equal(result.success, false)
    })

    it('should reject product without required name', () => {
      const productWithoutName = {
        ...baseProductData,
        name: undefined,
      }

      const result = CheckoutProductSchema.safeParse(productWithoutName)
      assert.equal(result.success, false)
    })

    it('should reject product without prices field', () => {
      const productWithoutPrices = {
        ...baseProductData,
        prices: undefined,
      }

      const result = CheckoutProductSchema.safeParse(productWithoutPrices)
      assert.equal(result.success, false)
    })

    it('should validate product with empty prices array', () => {
      const productWithEmptyPrices = {
        ...baseProductData,
        prices: [],
      }

      const result = CheckoutProductSchema.safeParse(productWithEmptyPrices)
      assert.equal(result.success, true)
    })

    it('should reject product with invalid recurring interval', () => {
      const productWithInvalidInterval = {
        ...baseProductData,
        recurringInterval: 'WEEKLY' as any,
      }

      const result = CheckoutProductSchema.safeParse(productWithInvalidInterval)
      assert.equal(result.success, false)
    })

    it('should reject product with invalid price in prices array', () => {
      const productWithInvalidPrice = {
        ...baseProductData,
        prices: [
          {
            ...baseProductPriceData,
            amountType: 'INVALID_TYPE' as any,
          },
        ],
      }

      const result = CheckoutProductSchema.safeParse(productWithInvalidPrice)
      assert.equal(result.success, false)
    })

    it('should handle null description properly', () => {
      const productWithNullDescription = {
        ...baseProductData,
        description: null,
      }

      const result = CheckoutProductSchema.safeParse(productWithNullDescription)
      assert.equal(result.success, true)
    })

    it('should handle null recurringInterval properly', () => {
      const productWithNullInterval = {
        ...baseProductData,
        recurringInterval: null,
      }

      const result = CheckoutProductSchema.safeParse(productWithNullInterval)
      assert.equal(result.success, true)
    })
  })

  describe('Integration scenarios', () => {
    it('should validate products with all supported price types', () => {
      const products = [
        {
          ...baseProductData,
          id: 'product_fixed',
          prices: [
            {
              ...baseProductPriceData,
              id: 'price_fixed',
              amountType: 'FIXED' as const,
              priceAmount: 2999,
            },
          ],
        },
        {
          ...baseProductData,
          id: 'product_custom',
          prices: [
            {
              ...baseProductPriceData,
              id: 'price_custom',
              amountType: 'CUSTOM' as const,
              priceAmount: null,
            },
          ],
        },
      ]

      products.forEach((product) => {
        const result = CheckoutProductSchema.safeParse(product)
        assert.equal(result.success, true)
      })
    })
  })
})
