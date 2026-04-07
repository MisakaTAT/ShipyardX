import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'

export const STORAGE_KEY = 'shipyardx-theme'

export type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function readStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  const stored = localStorage.getItem(storageKey) as Theme | null
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  const legacy = localStorage.getItem('theme')
  if (legacy === 'light' || legacy === 'dark') return legacy
  return defaultTheme
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'shipyardx-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(storageKey, defaultTheme))

  useEffect(() => {
    const root = window.document.documentElement

    const apply = () => {
      root.classList.remove('light', 'dark')
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        root.classList.add(systemTheme)
        return
      }
      root.classList.add(theme)
    }

    apply()

    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const value = {
    theme,
    setTheme: (next: Theme) => {
      localStorage.setItem(storageKey, next)
      setThemeState(next)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}

function subscribeHtmlClass(onChange: () => void) {
  const el = document.documentElement
  const observer = new MutationObserver(onChange)
  observer.observe(el, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

export function useIsLightMode() {
  return useSyncExternalStore(
    subscribeHtmlClass,
    () => !document.documentElement.classList.contains('dark'),
    () => false
  )
}
