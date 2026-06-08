import { invoke } from '@tauri-apps/api/core'
import { appLogDir } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { Bug, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'
import { Button } from '@/shared/ui/button'

export function DebugSettingsPanel() {
  const [pendingAction, setPendingAction] = useState<'devtools' | 'logs' | null>(null)

  const handleOpenDevtools = async () => {
    setPendingAction('devtools')
    try {
      await invoke('open_devtools')
      toast.success('已打开 DevTools')
    } catch (error) {
      toast.error(getErrorMessage(error, '打开 DevTools 失败'), {
        description: getErrorDescription(error, '打开 DevTools 失败'),
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
      toast.success('已打开日志目录', {
        description: logDir,
      })
    } catch (error) {
      toast.error(getErrorMessage(error, '打开日志目录失败'), {
        description: getErrorDescription(error, '打开日志目录失败'),
      })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <SettingsPanelShell>
      <SettingsPanelHeader
        eyebrow="Debug"
        title="调试"
        description="调试入口会作用于当前桌面端实例，并用于定位界面状态与后端日志。"
      />

      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title="开发者工具"
          description="打开当前主窗口的开发者工具"
          action={
            <Button
              variant="outline"
              className="w-full max-w-xs justify-center"
              onClick={() => void handleOpenDevtools()}
              disabled={pendingAction !== null}
            >
              <Bug className="size-4" />
              <span>{pendingAction === 'devtools' ? '正在打开…' : '打开开发者工具'}</span>
            </Button>
          }
        />

        <SettingsActionRow
          title="日志目录"
          description="打开当前应用的日志落盘目录"
          action={
            <Button
              variant="outline"
              className="w-full max-w-xs justify-center"
              onClick={() => void handleOpenLogDir()}
              disabled={pendingAction !== null}
            >
              <FolderOpen className="size-4" />
              <span>{pendingAction === 'logs' ? '正在打开…' : '打开日志目录'}</span>
            </Button>
          }
        />
      </div>
    </SettingsPanelShell>
  )
}
