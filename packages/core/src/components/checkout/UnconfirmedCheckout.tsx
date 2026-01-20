import { zodResolver } from '@hookform/resolvers/zod'
import type { Checkout } from '@moneydevkit/api-contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { clientConfirmCheckout } from '../../client-actions'
import { Button } from '../ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form'
import { Input } from '../ui/input'

type UnconfirmedCheckoutType = Extract<Checkout, { status: 'UNCONFIRMED' }>

export interface UnconfirmedCheckoutProps {
  checkout: UnconfirmedCheckoutType
}

/**
 * Convert camelCase field name to readable label.
 * e.g., "billingAddress" -> "Billing Address"
 */
function fieldToLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}

/**
 * Get fields that need to be shown in the form.
 * A field is shown if it's in requireCustomerData and not already provided.
 */
function getMissingRequiredFields(checkout: UnconfirmedCheckoutType): string[] {
  if (!checkout.requireCustomerData) return []

  return checkout.requireCustomerData.filter((field: string) => {
    const value = checkout.customer?.[field]
    return value === undefined || value === null || value === ''
  })
}

export default function UnconfirmedCheckout({ checkout }: UnconfirmedCheckoutProps) {
  const queryClient = useQueryClient()
  const missingFields = getMissingRequiredFields(checkout)

  // Track selected product for confirm call and CUSTOM price handling.
  // Setter intentionally omitted - single product only for now (multi-product selection coming later)
  const [selectedProductId] = useState<string | null>(
    checkout.products?.[0]?.id ?? null
  )

  // For CUSTOM price types, track the user-entered amount
  const [customAmount, setCustomAmount] = useState<string>('')
  const [customAmountError, setCustomAmountError] = useState<string | null>(null)

  // Get the selected product and check if it has a CUSTOM price
  const selectedProduct = checkout.products?.find((p) => p.id === selectedProductId)
  const selectedPrice = selectedProduct?.prices?.[0]
  const isCustomPrice = selectedPrice?.amountType === 'CUSTOM'

  // Build dynamic schema based on missing required fields
  const schemaShape: Record<string, z.ZodTypeAny> = {}
  for (const field of missingFields) {
    if (field === 'email') {
      schemaShape[field] = z.string().email('Please enter a valid email address')
    } else {
      schemaShape[field] = z.string().min(1, `${fieldToLabel(field)} is required`)
    }
  }
  const CustomerFormSchema = z.object(schemaShape)
  type CustomerFormData = z.infer<typeof CustomerFormSchema>

  // Build default values from existing customer data
  const defaultValues: Record<string, string> = {}
  for (const field of missingFields) {
    defaultValues[field] = ''
  }

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(CustomerFormSchema),
    defaultValues,
  })

  const confirmMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      // For product checkouts, include the selected product
      const productId = selectedProductId ?? checkout.products?.[0]?.id

      // Build the products payload
      let productsPayload: { productId: string; priceAmount?: number }[] | undefined
      if (checkout.type === 'PRODUCTS' && productId) {
        const product: { productId: string; priceAmount?: number } = { productId }

        // If CUSTOM price, include the user-entered amount
        // USD: convert dollars to cents (multiply by 100, with EPSILON for float precision)
        // SAT: use directly (amounts are in sats)
        if (isCustomPrice && customAmount) {
          const parsedAmount = Number.parseFloat(customAmount)
          const amountInSmallestUnit = checkout.currency === 'USD'
            ? Math.round(parsedAmount * 100 + Number.EPSILON)
            : Math.round(parsedAmount)
          product.priceAmount = amountInSmallestUnit
        }

        productsPayload = [product]
      }

      return await clientConfirmCheckout({
        checkoutId: checkout.id,
        customer: data,
        ...(productsPayload ? { products: productsPayload } : {}),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mdk-checkout', checkout.id] })
    },
    onError: (error) => {
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Something went wrong',
      })
    },
  })

  const onSubmit = (data: CustomerFormData) => {
    // Validate custom amount if required
    if (isCustomPrice) {
      const amount = Number.parseFloat(customAmount)
      const minAmount = checkout.currency === 'SAT' ? 1 : 0.01
      if (!customAmount || Number.isNaN(amount) || amount < minAmount) {
        setCustomAmountError(checkout.currency === 'SAT'
          ? 'Please enter at least 1 sat'
          : 'Please enter a valid amount')
        return
      }
      setCustomAmountError(null)
    }

    confirmMutation.mutate(data)
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100)
  }

  return (
    <>
      <div className="text-center mb-6">
        {checkout.type === 'PRODUCTS' && checkout.products && (
          <div className="space-y-2">
            {checkout.products.map((product) => (
              <div key={product.id} className="text-left">
                <h3 className="font-medium text-white">{product.name}</h3>
                {product.description && <p className="text-sm text-gray-400">{product.description}</p>}
                {product.prices?.[0] && (
                  <div className="text-sm text-gray-300">
                    {product.prices[0].amountType === 'FIXED' && product.prices[0].priceAmount && (
                      <span>{formatCurrency(product.prices[0].priceAmount, checkout.currency)}</span>
                    )}
                    {product.prices[0].amountType === 'CUSTOM' && (
                      <span className="text-gray-400">Pay what you want</span>
                    )}
                    {product.recurringInterval && (
                      <span className="text-gray-400">
                        /{product.recurringInterval.toLowerCase()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {checkout.type === 'AMOUNT' && checkout.providedAmount && (
          <div className="text-sm font-medium text-white" />
        )}
        {checkout.type === 'TOP_UP' && <div className="text-lg text-white">Account Top-up</div>}
      </div>

      {/* Custom price amount input */}
      {isCustomPrice && (
        <div className="mb-4">
          <label htmlFor="customAmount" className="block text-sm font-medium text-gray-300 mb-2">
            Enter Amount ({checkout.currency})
          </label>
          <div className="relative">
            {checkout.currency === 'USD' && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            )}
            <Input
              id="customAmount"
              type="number"
              min={checkout.currency === 'SAT' ? '1' : '0.01'}
              step={checkout.currency === 'SAT' ? '1' : '0.01'}
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value)
                setCustomAmountError(null)
              }}
              placeholder={checkout.currency === 'SAT' ? '1000' : '0.00'}
              className={`bg-gray-700 border-gray-600 focus:ring-purple-500 focus:border-purple-500 text-white placeholder-gray-400 ${checkout.currency === 'USD' ? 'pl-8' : 'pr-12'}`}
            />
            {checkout.currency === 'SAT' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">sats</span>
            )}
          </div>
          {customAmountError && (
            <p className="text-red-400 text-sm mt-1">{customAmountError}</p>
          )}
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {missingFields.map((field) => (
            <FormField
              key={field}
              control={form.control}
              name={field}
              render={({ field: formField }) => (
                <FormItem>
                  <FormLabel className="text-gray-300">{fieldToLabel(field)} *</FormLabel>
                  <FormControl>
                    <Input
                      {...formField}
                      type={field === 'email' ? 'email' : 'text'}
                      placeholder={`Enter your ${fieldToLabel(field).toLowerCase()}`}
                      className="bg-gray-700 border-gray-600 focus:ring-purple-500 focus:border-purple-500 text-white placeholder-gray-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          {form.formState.errors.root && (
            <div className="text-red-400 text-sm">Error: {form.formState.errors.root.message}</div>
          )}

          <Button
            type="submit"
            disabled={form.formState.isSubmitting || confirmMutation.isPending}
            className="w-full bg-white hover:bg-gray-100 text-black font-medium py-3 px-4 rounded-lg transition-colors border border-gray-200"
          >
            {form.formState.isSubmitting || confirmMutation.isPending ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Generating invoice...
              </div>
            ) : (
              'Proceed to Payment'
            )}
          </Button>
        </form>
      </Form>
    </>
  )
}
