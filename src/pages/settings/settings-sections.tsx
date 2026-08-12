import { AppWindow, Bug, CircleHelp, Keyboard, Stone, TerminalSquare, type LucideIcon } from 'lucide-react'

export type SettingsSectionKey = 'general' | 'appstore' | 'hotkeys' | 'terminal' | 'about' | 'debug'

export interface SettingsSection {
  key: SettingsSectionKey
  titleKey: `ui.settings.nav.${SettingsSectionKey}`
  icon: LucideIcon
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'general', titleKey: 'ui.settings.nav.general', icon: AppWindow },
  { key: 'appstore', titleKey: 'ui.settings.nav.appstore', icon: Stone },
  { key: 'hotkeys', titleKey: 'ui.settings.nav.hotkeys', icon: Keyboard },
  { key: 'terminal', titleKey: 'ui.settings.nav.terminal', icon: TerminalSquare },
  { key: 'debug', titleKey: 'ui.settings.nav.debug', icon: Bug },
  { key: 'about', titleKey: 'ui.settings.nav.about', icon: CircleHelp },
]
