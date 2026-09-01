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

type PendingAction = 'devtools' | 'logs' | 'log-level' | 'dependency-log-level'

export function DebugSettingsPanel() {
  const { t } = useTranslation()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [logLevel, setLogLevel] = useState<LogLevel>('info')
  const [dependencyLogLevel, setDependencyLogLevel] = useState<LogLevel>('warn')

  useEffect(() => {
    let cancelled = false

    const load = (command: string, apply: (level: LogLevel) => void, failedMessage: string) => {
      invoke<string>(command)
        .then((level) => {
          if (!cancelled && level && isLogLevel(level)) apply(level)
        })
        .catch((error) => {
          toast.error(getErrorMessage(error, failedMessage), {
            description: getErrorDescription(error, failedMessage),
          })
        })
    }

    load('get_log_level', setLogLevel, t('ui.settings.debug.logLevel.toastLoadFailed'))
    load('get_dependency_log_level', setDependencyLogLevel, t('ui.settings.debug.dependencyLogLevel.toastLoadFailed'))

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

  const changeLogLevel = async (options: {
    level: string
    command: string
    action: PendingAction
    current: LogLevel
    apply: (level: LogLevel) => void
    savedMessage: string
    failedMessage: string
  }) => {
    const { level, command, action, current, apply, savedMessage, failedMessage } = options
    if (!isLogLevel(level)) return

    apply(level)
    setPendingAction(action)
    try {
      const saved = await invoke<string>(command, { level })
      if (isLogLevel(saved)) apply(saved)
      toast.success(savedMessage)
    } catch (error) {
      apply(current)
      toast.error(getErrorMessage(error, failedMessage), {
        description: getErrorDescription(error, failedMessage),
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleLogLevelChange = (level: string) =>
    changeLogLevel({
      level,
      command: 'update_log_level',
      action: 'log-level',
      current: logLevel,
      apply: setLogLevel,
      savedMessage: t('ui.settings.debug.logLevel.toastSaved'),
      failedMessage: t('ui.settings.debug.logLevel.toastSaveFailed'),
    })

  const handleDependencyLogLevelChange = (level: string) =>
    changeLogLevel({
      level,
      command: 'update_dependency_log_level',
      action: 'dependency-log-level',
      current: dependencyLogLevel,
      apply: setDependencyLogLevel,
      savedMessage: t('ui.settings.debug.dependencyLogLevel.toastSaved'),
      failedMessage: t('ui.settings.debug.dependencyLogLevel.toastSaveFailed'),
    })

  return (
    <SettingsPanelShell>
      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title={t('ui.settings.debug.logLevel.title')}
          description={t('ui.settings.debug.logLevel.description')}
          action={<LogLevelSelect value={logLevel} onChange={handleLogLevelChange} disabled={pendingAction !== null} />}
        />

        <SettingsActionRow
          title={t('ui.settings.debug.dependencyLogLevel.title')}
          description={t('ui.settings.debug.dependencyLogLevel.description')}
          action={
            <LogLevelSelect
              value={dependencyLogLevel}
              onChange={handleDependencyLogLevelChange}
              disabled={pendingAction !== null}
            />
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

function LogLevelSelect({
  value,
  onChange,
  disabled,
}: {
  value: LogLevel
  onChange: (level: string) => void
  disabled: boolean
}) {
  return (
    <div className="w-full max-w-xs">
      <Select
        value={value}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next)
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{LOG_LEVEL_LABELS[value]}</SelectValue>
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
  )
}

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel)
}
