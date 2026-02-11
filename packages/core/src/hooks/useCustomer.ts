import { useCallback, useEffect, useState } from 'react'
import type { CustomerWithSubscriptions, GetCustomerInput } from '@moneydevkit/api-contract'
import { clientGetCustomer, type GetCustomerOptions } from '../client-actions'
import type { MdkError } from '../types'
import { log } from '../logging'

// Re-export for backwards compatibility
export type CustomerIdentifier = GetCustomerInput

export interface CustomerData extends CustomerWithSubscriptions {
  hasActiveSubscription: boolean
}

export interface UseCustomerOptions {
  /** Include sandbox subscriptions in the response. Defaults to false. */
  includeSandbox?: boolean
}

export function useCustomer(
  identifier: GetCustomerInput | null | undefined,
  options?: UseCustomerOptions
) {
  const [customer, setCustomer] = useState<CustomerData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<MdkError | null>(null)

  // Create stable identifier key for dependency tracking
  const identifierKey = identifier
    ? 'externalId' in identifier
      ? `externalId:${identifier.externalId ?? ''}`
      : 'email' in identifier
        ? `email:${identifier.email ?? ''}`
        : 'customerId' in identifier
          ? `customerId:${identifier.customerId ?? ''}`
          : null
    : null

  // Include options in the dependency key
  const optionsKey = options?.includeSandbox ? 'sandbox:true' : 'sandbox:false'

  const fetchCustomer = useCallback(async () => {
    if (!identifier) {
      setCustomer(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await clientGetCustomer(identifier, options)

    if (result.error) {
      log('Customer fetch error:', result.error)
      setError(result.error)
      setCustomer(null)
    } else {
      setCustomer({
        ...result.data,
        // Include 'past_due' because users retain access during the grace period
        hasActiveSubscription: result.data.subscriptions.some(
          (s) => s.status === 'active' || s.status === 'past_due'
        ),
      })
    }

    setIsLoading(false)
  }, [identifierKey, optionsKey])

  useEffect(() => {
    fetchCustomer()
  }, [fetchCustomer])

  return {
    customer,
    isLoading,
    error,
    refetch: fetchCustomer,
  }
}
