import { useEffect, useState } from 'react'
import { useAppSettings } from '@/app/settings-store'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { formatHotkeyLabel, hotkeyFromKeyboardEvent } from '@/shared/lib/hotkeys'
import { Button } from '@/shared/ui/button'

export function HotkeySettingsPanel() {
  const {
    settings: {
      hotkeys: { focusSearch, openTerminalSearch },
    },
    updateHotkeySettings,
    resetHotkeySettings,
  } = useAppSettings()
  const [recordingHotkey, setRecordingHotkey] = useState<'focusSearch' | 'openTerminalSearch' | null>(null)

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
          title="搜索聚焦"
          description="快速聚焦列表页搜索框"
          action={
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant={recordingHotkey === 'focusSearch' ? 'default' : 'outline'}
                onClick={() => setRecordingHotkey((value) => (value === 'focusSearch' ? null : 'focusSearch'))}
              >
                {recordingHotkey === 'focusSearch' ? '按下快捷键…' : formatHotkeyLabel(focusSearch)}
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
