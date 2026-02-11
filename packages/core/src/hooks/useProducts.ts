import { useCallback, useEffect, useState } from 'react'
import type { Product } from '@moneydevkit/api-contract'
import { clientListProducts } from '../client-actions'
import { log } from '../logging'

/**
 * Hook to fetch available products from the MDK API.
 *
 * @returns Object containing products, loading state, error, and refetch function
 *
 * @example
 * const { products } = useProducts()
 * // USD prices are in cents - divide by 100 for display
 * const displayPrice = (product.prices[0]?.priceAmount ?? 0) / 100
 * // SAT amounts are in satoshis - no conversion needed
 */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await clientListProducts()
      setProducts(result)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch products')
      log('Products fetch error:', error)
      setError(error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  return {
    products,
    isLoading,
    error,
    refetch: fetchProducts,
  }
}
