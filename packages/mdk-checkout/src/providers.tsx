'use client'

import { useState, type ReactNode } from 'react'
import {
  QueryClient as ReactQueryClient,
  QueryClientProvider,
  type QueryClient,
  type QueryClientConfig,
} from '@tanstack/react-query'

const DEFAULT_QUERY_CLIENT_CONFIG: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
    },
  },
}

export interface MdkCheckoutProviderProps {
  children: ReactNode
  queryClient?: QueryClient
}

export function MdkCheckoutProvider({ children, queryClient }: MdkCheckoutProviderProps) {
  const [client] = useState(() => queryClient ?? new ReactQueryClient(DEFAULT_QUERY_CLIENT_CONFIG))

  return (
    <QueryClientProvider client={client}>
      <div className="mdk-checkout">{children}</div>
    </QueryClientProvider>
  )
}
