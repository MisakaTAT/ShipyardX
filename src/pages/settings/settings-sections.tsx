import { AppWindow, TerminalSquare, type LucideIcon } from 'lucide-react'

export type SettingsSectionKey = 'app' | 'terminal'

export interface SettingsSection {
  key: SettingsSectionKey
  title: string
  icon: LucideIcon
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'app', title: '应用', icon: AppWindow },
  { key: 'terminal', title: '终端', icon: TerminalSquare },
]
