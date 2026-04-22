import { useTheme as useNextTheme } from 'next-themes'

export const STORAGE_KEY = 'shipyardx-theme'

export function useTheme() {
  return useNextTheme()
}

export function useIsLightMode() {
  const { theme, resolvedTheme } = useNextTheme()
  const current = theme === 'system' ? resolvedTheme : theme
  return current !== 'dark'
}
