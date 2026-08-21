import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { appLogDir } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { Bug, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SettingsActionRow, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

const LOG_LEVELS = ['off', 'error', 'warn', 'info', 'debug', 'trace'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  off: 'Off',
  error: 'Error',
  warn: 'Warn',
  info: 'Info',
  debug: 'Debug',
  trace: 'Trace',
}

export function DebugSettingsPanel() {
  const { t } = useTranslation()
  const [pendingAction, setPendingAction] = useState<'devtools' | 'logs' | 'log-level' | null>(null)
  const [logLevel, setLogLevel] = useState<LogLevel>('info')

  useEffect(() => {
    let cancelled = false

    invoke<string>('get_log_level')
      .then((level) => {
        if (!cancelled && level && isLogLevel(level)) setLogLevel(level)
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, t('ui.settings.debug.logLevel.toastLoadFailed')), {
          description: getErrorDescription(error, t('ui.settings.debug.logLevel.toastLoadFailed')),
        })
      })

    return () => {
      cancelled = true
    }
  }, [t])

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

  const handleLogLevelChange = async (level: string) => {
    if (!isLogLevel(level)) return

    const previous = logLevel
    setLogLevel(level)
    setPendingAction('log-level')
    try {
      const saved = await invoke<string>('update_log_level', { level })
      if (isLogLevel(saved)) setLogLevel(saved)
      toast.success(t('ui.settings.debug.logLevel.toastSaved'))
    } catch (error) {
      setLogLevel(previous)
      toast.error(getErrorMessage(error, t('ui.settings.debug.logLevel.toastSaveFailed')), {
        description: getErrorDescription(error, t('ui.settings.debug.logLevel.toastSaveFailed')),
      })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <SettingsPanelShell>
      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title={t('ui.settings.debug.logLevel.title')}
          description={t('ui.settings.debug.logLevel.description')}
          action={
            <div className="w-full max-w-xs">
              <Select
                value={logLevel}
                onValueChange={(value) => {
                  if (typeof value === 'string') void handleLogLevelChange(value)
                }}
                disabled={pendingAction !== null}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{LOG_LEVEL_LABELS[logLevel]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LOG_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {LOG_LEVEL_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

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

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel)
}
