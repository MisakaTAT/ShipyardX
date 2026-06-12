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

  const resetTerminalSettings: AppSettingsContextValue['resetTerminalSettings'] = () => {
    setSettings((current) => ({
      ...current,
      terminal: DEFAULT_SETTINGS.terminal,
    }))
  }

  return (
    <AppSettingsContext.Provider value={{ settings, updateTerminalSettings, resetSettings, resetTerminalSettings }}>
      {children}
    </AppSettingsContext.Provider>
  )
}
