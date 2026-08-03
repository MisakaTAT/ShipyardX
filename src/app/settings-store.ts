import { createContext, useContext } from 'react'
import { DEFAULT_APPSTORE_SOURCES } from '@/shared/lib/appstore-settings'
import { XTERM_THEME_NAMES } from '@/themes/xtermjs/names'
import { normalizeHotkey } from '@/shared/lib/hotkeys'

export const APP_SETTINGS_STORAGE_KEY = 'shipyardx-settings'

export type TerminalFrontend = 'xterm-canvas' | 'xterm-webgl'
export type TerminalCursorStyle = 'block' | 'underline' | 'bar'
export type TerminalThemeName = (typeof XTERM_THEME_NAMES)[number]

export interface AppSettings {
  hotkeys: {
    focusSearch: string | null
    openTerminalSearch: string | null
  }
  appstore: {
    sources: Array<{
      id: string
      name: string
      repoUrl: string
      enabled: boolean
    }>
    proxyEnabled: boolean
    proxyUrl: string
  }
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
  hotkeys: {
    focusSearch: '/',
    openTerminalSearch: 'Mod+F',
  },
  appstore: {
    sources: DEFAULT_APPSTORE_SOURCES,
    proxyEnabled: false,
    proxyUrl: 'http://127.0.0.1:7890',
  },
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
  updateHotkeySettings: (patch: Partial<AppSettings['hotkeys']>) => void
  updateAppStoreSettings: (next: AppSettings['appstore']) => void
  updateTerminalSettings: (patch: Partial<AppSettings['terminal']>) => void
  resetSettings: () => void
  resetHotkeySettings: () => void
  resetAppStoreSettings: () => void
  resetTerminalSettings: () => void
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

const THEME_NAME_SET: ReadonlySet<string> = new Set(XTERM_THEME_NAMES)

export function normalizeTerminalTheme(value: unknown): TerminalThemeName {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.terminal.theme
  return THEME_NAME_SET.has(value) ? (value as TerminalThemeName) : DEFAULT_SETTINGS.terminal.theme
}

function normalizeString(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

export function normalizeSettings(input: unknown): AppSettings {
  if (!input || typeof input !== 'object') return DEFAULT_SETTINGS

  const raw = input as {
    hotkeys?: {
      focusSearch?: unknown
      openTerminalSearch?: unknown
    }
    appstore?: unknown
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
    hotkeys: {
      focusSearch: normalizeHotkey(raw.hotkeys?.focusSearch) ?? DEFAULT_SETTINGS.hotkeys.focusSearch,
      openTerminalSearch:
        normalizeHotkey(raw.hotkeys?.openTerminalSearch) ?? DEFAULT_SETTINGS.hotkeys.openTerminalSearch,
    },
    appstore: normalizeAppstoreSettings(raw.appstore),
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

function normalizeAppstoreSettings(input: unknown): AppSettings['appstore'] {
  const fallbackSource = DEFAULT_SETTINGS.appstore.sources[0]
  if (!input || typeof input !== 'object') {
    return DEFAULT_SETTINGS.appstore
  }

  const raw = input as {
    sources?: Array<{
      id?: unknown
      name?: unknown
      repoUrl?: unknown
      enabled?: unknown
    }>
    proxyEnabled?: unknown
    proxyUrl?: unknown
  }

  if (!Array.isArray(raw.sources)) {
    return DEFAULT_SETTINGS.appstore
  }

  const sources = raw.sources.length
    ? raw.sources.map((source, index) => ({
        id: normalizeString(source.id, `source-${index + 1}`),
        name: normalizeString(source.name, `应用商店 ${index + 1}`),
        repoUrl: normalizeString(source.repoUrl, fallbackSource.repoUrl),
        enabled: normalizeBoolean(source.enabled, true),
      }))
    : [...DEFAULT_SETTINGS.appstore.sources]

  if (!sources.some((source) => source.enabled)) {
    sources[0] = { ...sources[0], enabled: true }
  }

  return {
    sources,
    proxyEnabled: normalizeBoolean(raw.proxyEnabled, DEFAULT_SETTINGS.appstore.proxyEnabled),
    proxyUrl: normalizeString(raw.proxyUrl, DEFAULT_SETTINGS.appstore.proxyUrl),
  }
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider')
  return ctx
}
