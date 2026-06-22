import { AppWindow, Bug, Keyboard, Stone, TerminalSquare, type LucideIcon } from 'lucide-react'

export type SettingsSectionKey = 'app' | 'appstore' | 'hotkeys' | 'terminal' | 'debug'

export interface SettingsSection {
  key: SettingsSectionKey
  title: string
  icon: LucideIcon
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'app', title: '应用信息', icon: AppWindow },
  { key: 'appstore', title: '商店配置', icon: Stone },
  { key: 'hotkeys', title: '热键管理', icon: Keyboard },
  { key: 'terminal', title: '终端设置', icon: TerminalSquare },
  { key: 'debug', title: '调试工具', icon: Bug },
]
