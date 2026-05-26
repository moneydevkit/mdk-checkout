import { createContext, useContext, useState, type ReactNode } from 'react'
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

// MdkTheme controls the checkout color palette. Defaults to 'dark'.
export type MdkTheme = 'dark' | 'light'

const MdkThemeContext = createContext<MdkTheme>('dark')

// useMdkTheme reads the active theme from the surrounding MdkCheckoutProvider.
export function useMdkTheme(): MdkTheme {
  return useContext(MdkThemeContext)
}

export interface MdkCheckoutProviderProps {
  children: ReactNode
  queryClient?: QueryClient
  theme?: MdkTheme
}

export function MdkCheckoutProvider({
  children,
  queryClient,
  theme = 'dark',
}: MdkCheckoutProviderProps) {
  const [client] = useState(() => queryClient ?? new ReactQueryClient(DEFAULT_QUERY_CLIENT_CONFIG))

  return (
    <QueryClientProvider client={client}>
      <MdkThemeContext.Provider value={theme}>
        <div className="mdk-checkout" data-theme={theme}>{children}</div>
      </MdkThemeContext.Provider>
    </QueryClientProvider>
  )
}
