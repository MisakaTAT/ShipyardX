import { useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppSettingsProvider } from '@/app/settings-provider'
import { ThemeProvider } from '@/app/theme-provider'
import { STORAGE_KEY } from '@/app/theme'
import { Toaster } from '@/shared/ui/sonner'
import { createQueryClient } from '@/shared/api/query-client'
import { HostKeyGuard } from '@/features/servers/ui/host-key-guard'

interface AppProvidersProps {
  children: ReactNode
}

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
      <AppSettingsProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <HostKeyGuard />
          <Toaster position="bottom-right" />
        </QueryClientProvider>
      </AppSettingsProvider>
    </ThemeProvider>
  )
}
