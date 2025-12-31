import { zodResolver } from '@hookform/resolvers/zod'
import type { Checkout } from '@moneydevkit/api-contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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

const CustomerFormSchema = z.object({
  customerEmail: z.string().email('Please enter a valid email address').optional(),
  customerName: z.string().optional(),
})

type CustomerFormData = z.infer<typeof CustomerFormSchema>

export interface UnconfirmedCheckoutProps {
  checkout: UnconfirmedCheckoutType
}

export default function UnconfirmedCheckout({ checkout }: UnconfirmedCheckoutProps) {
  const queryClient = useQueryClient()

  const needsEmail = checkout.requireCustomerData?.includes('email') && !checkout.customer?.email
  const needsName = checkout.requireCustomerData?.includes('name') && !checkout.customer?.name

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(CustomerFormSchema),
    defaultValues: {
      customerEmail: checkout.customer?.email || '',
      customerName: checkout.customer?.name || '',
    },
  })

  const confirmMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      const customer: { email?: string; name?: string } = {}
      if (data.customerEmail) {
        customer.email = data.customerEmail
      }
      if (data.customerName) {
        customer.name = data.customerName
      }
      return await clientConfirmCheckout({
        checkoutId: checkout.id,
        ...(Object.keys(customer).length > 0 && { customer }),
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
                {product.prices.map((price) => (
                  <div key={price.id} className="text-sm text-gray-300">
                    {price.amountType === 'FIXED' && price.priceAmount && (
                      <span>{formatCurrency(price.priceAmount, checkout.currency)}</span>
                    )}
                    {product.recurringInterval && (
                      <span className="text-gray-400">
                        /{product.recurringInterval.toLowerCase()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {checkout.type === 'AMOUNT' && checkout.providedAmount && (
          <div className="text-sm font-medium text-white" />
        )}
        {checkout.type === 'TOP_UP' && <div className="text-lg text-white">Account Top-up</div>}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {needsEmail && (
            <FormField
              control={form.control}
              name="customerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Email Address *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="Enter your email"
                      className="bg-gray-700 border-gray-600 focus:ring-purple-500 focus:border-purple-500 text-white placeholder-gray-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {needsName && (
            <FormField
              control={form.control}
              name="customerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Full Name *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="Enter your full name"
                      className="bg-gray-700 border-gray-600 focus:ring-purple-500 focus:border-purple-500 text-white placeholder-gray-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

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
