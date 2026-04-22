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

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => {
    ready: Promise<void>
    finished: Promise<void>
  }
}

export function runThemeTransition(origin: { x: number; y: number } | null, apply: () => void) {
  const doc = document as DocumentWithViewTransition

  if (!doc.startViewTransition || !origin) {
    apply()
    return
  }

  const { x, y } = origin
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

  const root = document.documentElement
  root.style.setProperty('--theme-x', `${x}px`)
  root.style.setProperty('--theme-y', `${y}px`)
  root.style.setProperty('--theme-r', `${radius}px`)

  doc.startViewTransition(apply)
}
