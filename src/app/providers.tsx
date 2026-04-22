import { useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/app/theme-provider'
import { STORAGE_KEY } from '@/app/theme'
import { Toaster } from '@/shared/ui/sonner'
import { createQueryClient } from '@/shared/api/query-client'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * 顶层 Provider 聚合：主题 + TanStack Query + Toast。
 */
export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={STORAGE_KEY}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
