'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes'

export const STORAGE_KEY = 'shipyardx-theme'

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <NextThemesProvider {...props}>
      <ThemeClassSync />
      {mounted ? children : null}
    </NextThemesProvider>
  )
}

export function useTheme() {
  return useNextTheme()
}

export function useIsLightMode() {
  const { theme, resolvedTheme } = useNextTheme()
  const current = theme === 'system' ? resolvedTheme : theme
  return current !== 'dark'
}

function ThemeClassSync() {
  const { resolvedTheme } = useNextTheme()

  React.useEffect(() => {
    if (!resolvedTheme) return
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
    root.style.colorScheme = resolvedTheme === 'dark' ? 'dark' : 'light'
  }, [resolvedTheme])

  return null
}
