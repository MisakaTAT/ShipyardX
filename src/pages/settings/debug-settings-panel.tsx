import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { appLogDir } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { Bug, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { SettingsActionRow, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'
import { Button } from '@/shared/ui/button'

export function DebugSettingsPanel() {
  const { t } = useTranslation()
  const [pendingAction, setPendingAction] = useState<'devtools' | 'logs' | null>(null)

  const handleOpenDevtools = async () => {
    setPendingAction('devtools')
    try {
      await invoke('open_devtools')
      toast.success(t('ui.settings.debug.devtools.toastOpened'))
    } catch (error) {
      toast.error(getErrorMessage(error, t('ui.settings.debug.devtools.toastFailed')), {
        description: getErrorDescription(error, t('ui.settings.debug.devtools.toastFailed')),
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleOpenLogDir = async () => {
    setPendingAction('logs')
    try {
      const logDir = await appLogDir()
      await openPath(logDir)
      toast.success(t('ui.settings.debug.logs.toastOpened'), {
        description: logDir,
      })
    } catch (error) {
      toast.error(getErrorMessage(error, t('ui.settings.debug.logs.toastFailed')), {
        description: getErrorDescription(error, t('ui.settings.debug.logs.toastFailed')),
      })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <SettingsPanelShell>
      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title={t('ui.settings.debug.devtools.title')}
          description={t('ui.settings.debug.devtools.description')}
          action={
            <Button
              variant="outline"
              className="w-full max-w-xs justify-center"
              onClick={() => void handleOpenDevtools()}
              disabled={pendingAction !== null}
            >
              <Bug className="size-4" />
              <span>
                {pendingAction === 'devtools' ? t('ui.common.opening') : t('ui.settings.debug.devtools.action')}
              </span>
            </Button>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.debug.logs.title')}
          description={t('ui.settings.debug.logs.description')}
          action={
            <Button
              variant="outline"
              className="w-full max-w-xs justify-center"
              onClick={() => void handleOpenLogDir()}
              disabled={pendingAction !== null}
            >
              <FolderOpen className="size-4" />
              <span>{pendingAction === 'logs' ? t('ui.common.opening') : t('ui.settings.debug.logs.action')}</span>
            </Button>
          }
        />
      </div>
    </SettingsPanelShell>
  )
}
