import { AppWindow, Bug, CircleHelp, Keyboard, Stone, TerminalSquare, type LucideIcon } from 'lucide-react'

export type SettingsSectionKey = 'general' | 'appstore' | 'hotkeys' | 'terminal' | 'about' | 'debug'

export interface SettingsSection {
  key: SettingsSectionKey
  titleKey: `settings.nav.${SettingsSectionKey}`
  icon: LucideIcon
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'general', titleKey: 'settings.nav.general', icon: AppWindow },
  { key: 'appstore', titleKey: 'settings.nav.appstore', icon: Stone },
  { key: 'hotkeys', titleKey: 'settings.nav.hotkeys', icon: Keyboard },
  { key: 'terminal', titleKey: 'settings.nav.terminal', icon: TerminalSquare },
  { key: 'debug', titleKey: 'settings.nav.debug', icon: Bug },
  { key: 'about', titleKey: 'settings.nav.about', icon: CircleHelp },
]
