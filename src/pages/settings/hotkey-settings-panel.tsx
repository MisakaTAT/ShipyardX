import { useEffect, useState } from 'react'
import { useAppSettings } from '@/app/settings-store'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { formatHotkeyLabel, hotkeyFromKeyboardEvent } from '@/shared/lib/hotkeys'
import { Button } from '@/shared/ui/button'

export function HotkeySettingsPanel() {
  const {
    settings: {
      hotkeys: { commandPalette, openTerminalSearch },
    },
    updateHotkeySettings,
    resetHotkeySettings,
  } = useAppSettings()
  const [recordingHotkey, setRecordingHotkey] = useState<'commandPalette' | 'openTerminalSearch' | null>(null)

  useEffect(() => {
    if (!recordingHotkey) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setRecordingHotkey(null)
        return
      }

      const nextHotkey = hotkeyFromKeyboardEvent(event)
      if (!nextHotkey) return

      event.preventDefault()
      updateHotkeySettings({ [recordingHotkey]: nextHotkey })
      setRecordingHotkey(null)
      toast.success(`热键已更新为 ${formatHotkeyLabel(nextHotkey)}`)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [recordingHotkey, updateHotkeySettings])

  return (
    <SettingsPanelShell>
      <SettingsPanelHeader eyebrow="Hotkeys" title="热键管理" />

      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title="命令面板"
          description="搜索服务器、转发规则、主机指纹，或直接执行命令"
          action={
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant={recordingHotkey === 'commandPalette' ? 'default' : 'outline'}
                onClick={() => setRecordingHotkey((value) => (value === 'commandPalette' ? null : 'commandPalette'))}
              >
                {recordingHotkey === 'commandPalette' ? '按下快捷键…' : formatHotkeyLabel(commandPalette)}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  resetHotkeySettings()
                  setRecordingHotkey(null)
                  toast.success('热键设置已恢复默认')
                }}
              >
                恢复默认
              </Button>
            </div>
          }
        />

        <SettingsActionRow
          title="终端搜索"
          description="显示终端内搜索工具条并聚焦输入框"
          action={
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant={recordingHotkey === 'openTerminalSearch' ? 'default' : 'outline'}
                onClick={() =>
                  setRecordingHotkey((value) => (value === 'openTerminalSearch' ? null : 'openTerminalSearch'))
                }
              >
                {recordingHotkey === 'openTerminalSearch'
                  ? '请按下快捷键来录制'
                  : formatHotkeyLabel(openTerminalSearch)}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  resetHotkeySettings()
                  setRecordingHotkey(null)
                  toast.success('热键设置已恢复默认')
                }}
              >
                恢复默认
              </Button>
            </div>
          }
        />
      </div>
    </SettingsPanelShell>
  )
}
