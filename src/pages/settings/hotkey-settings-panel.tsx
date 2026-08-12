import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppSettings } from '@/app/settings-store'
import { SettingsActionRow, SettingsPanelShell, SettingsResetRow } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { formatHotkeyLabel, hotkeyFromKeyboardEvent, setHotkeyCapturing } from '@/shared/lib/hotkeys'
import { Button } from '@/shared/ui/button'

export function HotkeySettingsPanel() {
  const { t } = useTranslation()
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
      toast.success(t('ui.settings.hotkeys.toast.updated', { hotkey: formatHotkeyLabel(nextHotkey) }))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      setHotkeyCapturing(false)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [recordingHotkey, updateHotkeySettings, t])

  return (
    <SettingsPanelShell>
      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title={t('ui.settings.hotkeys.commandPalette.title')}
          description={t('ui.settings.hotkeys.commandPalette.description')}
          action={
            <Button
              type="button"
              variant={recordingHotkey === 'commandPalette' ? 'default' : 'outline'}
              className="w-full max-w-xs justify-center font-hotkey"
              onClick={() => setRecordingHotkey((value) => (value === 'commandPalette' ? null : 'commandPalette'))}
            >
              {recordingHotkey === 'commandPalette'
                ? t('ui.settings.hotkeys.recording')
                : formatHotkeyLabel(commandPalette, t('ui.settings.hotkeys.unset'))}
            </Button>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.hotkeys.terminalSearch.title')}
          description={t('ui.settings.hotkeys.terminalSearch.description')}
          action={
            <Button
              type="button"
              variant={recordingHotkey === 'openTerminalSearch' ? 'default' : 'outline'}
              className="w-full max-w-xs justify-center font-hotkey"
              onClick={() =>
                setRecordingHotkey((value) => (value === 'openTerminalSearch' ? null : 'openTerminalSearch'))
              }
            >
              {recordingHotkey === 'openTerminalSearch'
                ? t('ui.settings.hotkeys.recording')
                : formatHotkeyLabel(openTerminalSearch, t('ui.settings.hotkeys.unset'))}
            </Button>
          }
        />

        <SettingsResetRow
          description={t('ui.settings.hotkeys.resetDesc')}
          onReset={() => {
            resetHotkeySettings()
            setRecordingHotkey(null)
            toast.success(t('ui.settings.hotkeys.toast.reset'))
          }}
        />
      </div>
    </SettingsPanelShell>
  )
}
