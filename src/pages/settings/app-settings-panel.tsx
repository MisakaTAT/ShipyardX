import { SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'

export function AppSettingsPanel() {
  return (
    <SettingsPanelShell>
      <SettingsPanelHeader eyebrow="Application" title="应用" description="应用级设置。" />
    </SettingsPanelShell>
  )
}
