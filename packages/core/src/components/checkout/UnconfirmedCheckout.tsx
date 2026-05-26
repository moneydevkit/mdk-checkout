import { zodResolver } from '@hookform/resolvers/zod'
import type { Checkout } from '@moneydevkit/api-contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { clientConfirmCheckout } from '../../client-actions'
import {
  fieldToLabel,
  getMissingRequiredFields,
  convertCustomAmountToSmallestUnit,
  validateCustomAmount,
  formatInterval,
} from '../../checkout-utils'
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

  // Check if checkout has recurring products (subscriptions require email)
  const hasRecurringProduct = checkout.products?.some(p => p.recurringInterval) ?? false
  const hasEmail = Boolean(checkout.customer?.email)

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
        if (isCustomPrice && customAmount) {
          product.priceAmount = convertCustomAmountToSmallestUnit(customAmount, checkout.currency)
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
      const error = validateCustomAmount(customAmount, checkout.currency)
      if (error) {
        setCustomAmountError(error)
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

  // Show loading state during auto-submit (when no form fields needed)
  const isAutoSubmitting = confirmMutation.isPending && missingFields.length === 0 && !isCustomPrice && (!hasRecurringProduct || hasEmail)
  if (isAutoSubmitting) {
    return (
      <div className="text-center py-8">
        <div
          className="animate-spin rounded-full h-8 w-8 mx-auto mb-4"
          style={{ borderStyle: 'solid', borderWidth: '2px', borderColor: 'var(--mdk-line)', borderTopColor: 'var(--mdk-teal)' }}
        />
        <p className="mdk-label">› Preparing checkout…</p>
      </div>
    )
  }

  return (
    <>
      <div className="text-center mb-6">
        {checkout.type === 'PRODUCTS' && checkout.products && (
          <div className="space-y-2">
            {checkout.products.map((product) => (
              <div key={product.id} className="text-left">
                <h3 className="mdk-title" style={{ fontSize: '1.15rem' }}>{product.name}</h3>
                {product.description && <p className="mdk-body mdk-text-muted" style={{ fontSize: '14px' }}>{product.description}</p>}
                {product.prices?.[0] && (
                  <div className="mdk-mono mdk-text-muted" style={{ fontSize: '13px' }}>
                    {product.prices[0].amountType === 'FIXED' && product.prices[0].priceAmount && (
                      <span>{formatCurrency(product.prices[0].priceAmount, checkout.currency)}</span>
                    )}
                    {product.prices[0].amountType === 'CUSTOM' && (
                      <span className="mdk-text-faint">Pay what you want</span>
                    )}
                    {product.recurringInterval && (
                      <span className="mdk-text-faint">
                        {formatInterval(product.recurringInterval, 'short')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {checkout.type === 'AMOUNT' && checkout.providedAmount && (
          <div className="text-sm font-medium mdk-text-fg" />
        )}
        {checkout.type === 'TOP_UP' && <div className="mdk-title" style={{ fontSize: '1.25rem' }}>Account Top-up</div>}
      </div>

      {/* Custom price amount input */}
      {isCustomPrice && (
        <div className="mb-4">
          <label htmlFor="customAmount" className="mdk-label block mb-2">
            › Enter Amount ({checkout.currency === 'SAT' ? '₿' : checkout.currency})
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 mdk-text-faint mdk-mono">
              {checkout.currency === 'SAT' ? '₿' : '$'}
            </span>
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
              placeholder={checkout.currency === 'SAT' ? '1000' : ''}
              className="mdk-panel-inset mdk-mono mdk-text-fg w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{
                background: 'var(--mdk-bg)',
                border: '1px solid var(--mdk-line-soft)',
                color: 'var(--mdk-fg)',
                borderRadius: 0,
                padding: '0.6rem 0.75rem',
                paddingLeft: '1.75rem',
                paddingRight: '0.75rem',
              }}
            />
          </div>
          {customAmountError && (
            <p className="mdk-text-amber mt-1" style={{ fontSize: '13px' }}>{customAmountError}</p>
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
                  <FormLabel className="mdk-label">{fieldToLabel(field)}*</FormLabel>
                  <FormControl>
                    <Input
                      {...formField}
                      type={field === 'email' ? 'email' : 'text'}
                      placeholder={`Enter your ${fieldToLabel(field).toLowerCase()}`}
                      className="mdk-mono mdk-text-fg w-full"
                      style={{
                        background: 'var(--mdk-bg)',
                        border: '1px solid var(--mdk-line-soft)',
                        color: 'var(--mdk-fg)',
                        borderRadius: 0,
                        padding: '0.6rem 0.75rem',
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          {form.formState.errors.root && (
            <div className="mdk-text-amber" style={{ fontSize: '13px' }}>Error: {form.formState.errors.root.message}</div>
          )}

          <button
            type="submit"
            disabled={form.formState.isSubmitting || confirmMutation.isPending}
            className="mdk-button mdk-button-primary w-full"
          >
            {form.formState.isSubmitting || confirmMutation.isPending ? (
              <span className="inline-flex items-center justify-center">
                <span
                  className="animate-spin rounded-full h-4 w-4 mr-2"
                  style={{ borderStyle: 'solid', borderWidth: '2px', borderColor: 'var(--mdk-line)', borderTopColor: 'var(--mdk-teal)' }}
                />
                Generating invoice…
              </span>
            ) : (
              'Proceed to Payment'
            )}
          </button>
        </form>
      </Form>
    </>
  )
}
