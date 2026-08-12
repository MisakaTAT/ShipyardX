import { useEffect, useState } from 'react'
import { useAppSettings } from '@/app/settings-store'
import { SettingsActionRow, SettingsPanelShell, SettingsResetRow } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { formatHotkeyLabel, hotkeyFromKeyboardEvent, setHotkeyCapturing } from '@/shared/lib/hotkeys'
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
    setHotkeyCapturing(true)

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
    return () => {
      setHotkeyCapturing(false)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [recordingHotkey, updateHotkeySettings])

  return (
    <SettingsPanelShell>
      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title="命令面板"
          description="搜索服务器、转发规则、主机指纹，或直接执行命令"
          action={
            <Button
              type="button"
              variant={recordingHotkey === 'commandPalette' ? 'default' : 'outline'}
              className="w-full max-w-xs justify-center font-hotkey"
              onClick={() => setRecordingHotkey((value) => (value === 'commandPalette' ? null : 'commandPalette'))}
            >
              {recordingHotkey === 'commandPalette' ? '按下快捷键…' : formatHotkeyLabel(commandPalette)}
            </Button>
          }
        />

        <SettingsActionRow
          title="终端搜索"
          description="显示终端内搜索工具条并聚焦输入框"
          action={
            <Button
              type="button"
              variant={recordingHotkey === 'openTerminalSearch' ? 'default' : 'outline'}
              className="w-full max-w-xs justify-center font-hotkey"
              onClick={() =>
                setRecordingHotkey((value) => (value === 'openTerminalSearch' ? null : 'openTerminalSearch'))
              }
            >
              {recordingHotkey === 'openTerminalSearch' ? '按下快捷键…' : formatHotkeyLabel(openTerminalSearch)}
            </Button>
          }
        />

        <SettingsResetRow
          description="将全部快捷键还原为初始组合"
          onReset={() => {
            resetHotkeySettings()
            setRecordingHotkey(null)
            toast.success('热键设置已恢复默认')
          }}
        />
      </div>
    </SettingsPanelShell>
  )
}
