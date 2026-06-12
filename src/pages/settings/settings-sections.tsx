import { AppWindow, Bug, Keyboard, TerminalSquare, type LucideIcon } from 'lucide-react'

export type SettingsSectionKey = 'app' | 'hotkeys' | 'terminal' | 'debug'

export interface SettingsSection {
  key: SettingsSectionKey
  title: string
  icon: LucideIcon
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'app', title: '应用', icon: AppWindow },
  { key: 'hotkeys', title: '热键', icon: Keyboard },
  { key: 'terminal', title: '终端', icon: TerminalSquare },
  { key: 'debug', title: '调试', icon: Bug },
]
