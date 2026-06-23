import { AppWindow, Bug, CircleHelp, Keyboard, Stone, TerminalSquare, type LucideIcon } from 'lucide-react'

export type SettingsSectionKey = 'general' | 'appstore' | 'hotkeys' | 'terminal' | 'about' | 'debug'

export interface SettingsSection {
  key: SettingsSectionKey
  title: string
  icon: LucideIcon
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'general', title: '通用', icon: AppWindow },
  { key: 'appstore', title: '应用商店', icon: Stone },
  { key: 'hotkeys', title: '热键管理', icon: Keyboard },
  { key: 'terminal', title: '终端设置', icon: TerminalSquare },
  { key: 'debug', title: '调试', icon: Bug },
  { key: 'about', title: '关于', icon: CircleHelp },
]
