import { useEffect, useState, type ReactNode } from 'react'
import { applyLanguage } from '@/app/i18n'
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

  useEffect(() => {
    applyLanguage(settings.language)
  }, [settings.language])

  // 跟随系统时，系统语言在运行中变化也要跟上
  useEffect(() => {
    if (settings.language !== 'system') return
    const handler = () => applyLanguage('system')
    window.addEventListener('languagechange', handler)
    return () => window.removeEventListener('languagechange', handler)
  }, [settings.language])

  const updateLanguage: AppSettingsContextValue['updateLanguage'] = (language) => {
    setSettings((current) => ({ ...current, language }))
  }

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

  const updateAppStoreSettings: AppSettingsContextValue['updateAppStoreSettings'] = (next) => {
    setSettings((current) => ({
      ...current,
      appstore: next,
    }))
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

  const resetAppStoreSettings: AppSettingsContextValue['resetAppStoreSettings'] = () => {
    setSettings((current) => ({
      ...current,
      appstore: DEFAULT_SETTINGS.appstore,
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
        updateLanguage,
        updateHotkeySettings,
        updateAppStoreSettings,
        updateTerminalSettings,
        resetSettings,
        resetHotkeySettings,
        resetAppStoreSettings,
        resetTerminalSettings,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  )
}
