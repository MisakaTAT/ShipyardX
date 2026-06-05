import { createContext, useContext } from 'react'
import { XTERM_THEME_MAP } from '@/themes/xtermjs'

export const APP_SETTINGS_STORAGE_KEY = 'shipyardx-settings'

export type TerminalFrontend = 'xterm-canvas' | 'xterm-webgl'
export type TerminalCursorStyle = 'block' | 'underline' | 'bar'
export type TerminalThemeName = keyof typeof XTERM_THEME_MAP

export interface AppSettings {
  terminal: {
    frontend: TerminalFrontend
    theme: TerminalThemeName
    scrollback: number
    ligatures: boolean
    fontFamily: string
    fontSize: number
    cursorStyle: TerminalCursorStyle
    cursorBlink: boolean
    lineHeight: number
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  terminal: {
    frontend: 'xterm-webgl',
    theme: 'Dracula',
    scrollback: 25000,
    ligatures: true,
    fontFamily: 'Menlo',
    fontSize: 14,
    cursorStyle: 'block',
    cursorBlink: true,
    lineHeight: 0,
  },
}

export interface AppSettingsContextValue {
  settings: AppSettings
  updateTerminalSettings: (patch: Partial<AppSettings['terminal']>) => void
  resetSettings: () => void
}

export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

export function clampScrollback(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_SETTINGS.terminal.scrollback
  return Math.round(numeric)
}

export function clampFontSize(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_SETTINGS.terminal.fontSize
  return Math.min(50, Math.max(0, Math.round(numeric)))
}

export function clampLineHeight(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_SETTINGS.terminal.lineHeight
  return Math.round(numeric * 100) / 100
}

export function normalizeFontFamily(value: unknown) {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.terminal.fontFamily
  const trimmed = value.trim()
  return trimmed || DEFAULT_SETTINGS.terminal.fontFamily
}

export function normalizeTerminalTheme(value: unknown): TerminalThemeName {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.terminal.theme
  return value in XTERM_THEME_MAP ? (value as TerminalThemeName) : DEFAULT_SETTINGS.terminal.theme
}

export function normalizeSettings(input: unknown): AppSettings {
  if (!input || typeof input !== 'object') return DEFAULT_SETTINGS

  const raw = input as {
    terminal?: {
      frontend?: unknown
      theme?: unknown
      scrollback?: unknown
      ligatures?: unknown
      fontFamily?: unknown
      fontSize?: unknown
      cursorStyle?: unknown
      cursorBlink?: unknown
      lineHeight?: unknown
    }
  }

  const frontend =
    raw.terminal?.frontend === 'xterm-canvas' || raw.terminal?.frontend === 'xterm-webgl'
      ? raw.terminal.frontend
      : DEFAULT_SETTINGS.terminal.frontend
  const cursorStyle =
    raw.terminal?.cursorStyle === 'block' ||
    raw.terminal?.cursorStyle === 'underline' ||
    raw.terminal?.cursorStyle === 'bar'
      ? raw.terminal.cursorStyle
      : DEFAULT_SETTINGS.terminal.cursorStyle

  return {
    terminal: {
      frontend,
      theme: normalizeTerminalTheme(raw.terminal?.theme),
      scrollback: clampScrollback(raw.terminal?.scrollback),
      ligatures:
        typeof raw.terminal?.ligatures === 'boolean' ? raw.terminal.ligatures : DEFAULT_SETTINGS.terminal.ligatures,
      fontFamily: normalizeFontFamily(raw.terminal?.fontFamily),
      fontSize: clampFontSize(raw.terminal?.fontSize),
      cursorStyle,
      cursorBlink:
        typeof raw.terminal?.cursorBlink === 'boolean'
          ? raw.terminal.cursorBlink
          : DEFAULT_SETTINGS.terminal.cursorBlink,
      lineHeight: clampLineHeight(raw.terminal?.lineHeight),
    },
  }
}

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS

  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider')
  return ctx
}
