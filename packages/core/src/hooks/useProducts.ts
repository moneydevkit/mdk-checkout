import { useCallback, useEffect, useState } from 'react'
import type { Product } from '@moneydevkit/api-contract'
import { clientListProducts } from '../client-actions'
import { log } from '../logging'

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
