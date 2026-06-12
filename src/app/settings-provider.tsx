import { useEffect, useState, type ReactNode } from 'react'
import {
  APP_SETTINGS_STORAGE_KEY,
  AppSettingsContext,
  DEFAULT_SETTINGS,
  normalizeSettings,
  loadSettings,
  type AppSettingsContextValue,
} from '@/app/settings-store'

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => loadSettings())

  useEffect(() => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const updateHotkeySettings: AppSettingsContextValue['updateHotkeySettings'] = (patch) => {
    setSettings((current) =>
      normalizeSettings({
        ...current,
        hotkeys: {
          ...current.hotkeys,
          ...patch,
        },
      })
    )
  }

  const updateTerminalSettings: AppSettingsContextValue['updateTerminalSettings'] = (patch) => {
    setSettings((current) => ({
      ...current,
      terminal: normalizeSettings({
        ...current,
        terminal: {
          ...current.terminal,
          ...patch,
        },
      }).terminal,
    }))
  }

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  const resetHotkeySettings: AppSettingsContextValue['resetHotkeySettings'] = () => {
    setSettings((current) => ({
      ...current,
      hotkeys: DEFAULT_SETTINGS.hotkeys,
    }))
  }

  const resetTerminalSettings: AppSettingsContextValue['resetTerminalSettings'] = () => {
    setSettings((current) => ({
      ...current,
      terminal: DEFAULT_SETTINGS.terminal,
    }))
  }

  return (
    <AppSettingsContext.Provider
      value={{
        settings,
        updateHotkeySettings,
        updateTerminalSettings,
        resetSettings,
        resetHotkeySettings,
        resetTerminalSettings,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  )
}
