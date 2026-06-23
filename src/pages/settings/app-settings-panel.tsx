import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { runThemeTransition, useTheme } from '@/app/theme'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { formatDateTimeString } from '@/shared/lib/datetime'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
import { formatBytes } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ButtonGroup } from '@/shared/ui/button-group'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'downloading' | 'installed' | 'error'

type AppearanceTheme = 'light' | 'dark' | 'system'

const THEME_OPTIONS: Array<{ value: AppearanceTheme; label: string; description: string }> = [
  { value: 'light', label: '浅色', description: '始终使用浅色界面' },
  { value: 'dark', label: '深色', description: '始终使用深色界面' },
  { value: 'system', label: '跟随系统', description: '根据系统外观自动切换' },
]

function formatProgress(downloadedBytes: number, totalBytes: number | null) {
  if (!Number.isFinite(downloadedBytes) || downloadedBytes <= 0) return '准备下载…'
  if (totalBytes && Number.isFinite(totalBytes) && totalBytes > 0) {
    const progress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    return `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${progress}%)`
  }
  return `已下载 ${formatBytes(downloadedBytes)}`
}

export function GeneralSettingsPanel() {
  const { theme, setTheme } = useTheme()
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string>('-')

  useEffect(() => {
    return () => {
      if (!pendingUpdate) return
      void pendingUpdate.close().catch(() => undefined)
    }
  }, [pendingUpdate])

  useEffect(() => {
    let cancelled = false
    void getVersion()
      .then((version) => {
        if (!cancelled) setCurrentVersion(version)
      })
      .catch(() => {
        if (!cancelled) setCurrentVersion('-')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleCheckUpdate = async () => {
    if (pendingUpdate) {
      void pendingUpdate.close().catch(() => undefined)
    }

    setUpdateStatus('checking')
    setPendingUpdate(null)
    setDownloadedBytes(0)
    setTotalBytes(null)

    try {
      const update = await check()
      if (!update) {
        setUpdateStatus('latest')
        toast.success('当前已经是最新版本')
        return
      }

      setPendingUpdate(update)
      setUpdateStatus('available')
      toast.info(`发现新版本 ${update.version}`, {
        description: update.body?.trim() || '可以开始下载并安装更新',
      })
    } catch (error) {
      setUpdateStatus('error')
      toast.error(getErrorMessage(error, '检查更新失败'), {
        description: getErrorDescription(error, '请确认 updater 已正确配置后再试'),
      })
    }
  }

  const handleInstallUpdate = async () => {
    if (!pendingUpdate) return

    setUpdateStatus('downloading')
    setDownloadedBytes(0)
    setTotalBytes(null)

    try {
      await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          setDownloadedBytes(0)
          setTotalBytes(event.data.contentLength ?? null)
          return
        }
        if (event.event === 'Progress') {
          setDownloadedBytes((current) => current + event.data.chunkLength)
        }
      })

      setUpdateStatus('installed')
      toast.success(`ShipyardX ${pendingUpdate.version} 已安装`, {
        description: '更新包已经安装完成，请重启应用以使用新版本',
      })
    } catch (error) {
      setUpdateStatus('error')
      toast.error(getErrorMessage(error, '安装更新失败'), {
        description: getErrorDescription(error, '安装过程中出现问题，请稍后重试'),
      })
    }
  }

  const updateDescription =
    updateStatus === 'downloading'
      ? `正在下载更新包，${formatProgress(downloadedBytes, totalBytes)}`
      : updateStatus === 'installed'
        ? '新版本已准备完成，重启应用后即可生效'
        : updateStatus === 'latest'
          ? '当前已经是最新版本'
          : pendingUpdate
            ? `发现新版本 ${pendingUpdate.version}${pendingUpdate.date ? `，发布于 ${formatDateTimeString(pendingUpdate.date)}` : ''}`
            : '检查并安装最新版本'

  const updateActionLabel =
    updateStatus === 'checking'
      ? '正在检查…'
      : updateStatus === 'downloading'
        ? '正在下载安装…'
        : pendingUpdate
          ? `安装 ${pendingUpdate.version}`
          : '检查更新'

  const currentTheme = (theme ?? 'system') as AppearanceTheme
  const themeDescription =
    THEME_OPTIONS.find((option) => option.value === currentTheme)?.description ?? '根据系统外观自动切换'
  const updateSummary =
    updateStatus === 'checking'
      ? '正在检查更新'
      : updateStatus === 'downloading'
        ? '正在下载更新'
        : updateStatus === 'installed'
          ? '等待重启'
          : updateStatus === 'available'
            ? `发现新版本 ${pendingUpdate?.version ?? ''}`.trim()
            : updateStatus === 'error'
              ? '检查更新失败'
              : updateStatus === 'latest'
                ? '已是最新版本'
                : '尚未检查'

  return (
    <SettingsPanelShell>
      <SettingsPanelHeader eyebrow="General" title="通用" />

      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title="主题设置"
          description={themeDescription}
          action={
            <ButtonGroup className="w-full max-w-xs">
              {THEME_OPTIONS.map((option) => {
                const active = currentTheme === option.value
                return (
                  <Button
                    key={option.value}
                    type="button"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      runThemeTransition(
                        {
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2,
                        },
                        () => setTheme(option.value)
                      )
                    }}
                    variant={active ? 'default' : 'outline'}
                    className="flex-1"
                  >
                    {option.label}
                  </Button>
                )
              })}
            </ButtonGroup>
          }
        />

        <SettingsActionRow
          title="版本信息"
          description={updateDescription}
          action={
            <div className="w-full max-w-xs text-right">
              <div className="text-sm font-medium text-foreground">当前版本 {currentVersion}</div>
              <div className="mt-1 text-xs text-muted-foreground">{updateSummary}</div>
            </div>
          }
        />

        <SettingsActionRow
          title="检查更新"
          description="检查并安装最新版本"
          action={
            <div className="flex w-full max-w-xs justify-end">
              <Button
                variant={pendingUpdate ? 'default' : 'outline'}
                className="justify-center"
                onClick={() => void (pendingUpdate ? handleInstallUpdate() : handleCheckUpdate())}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installed'}
              >
                {updateStatus === 'checking' || updateStatus === 'downloading' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : pendingUpdate ? (
                  <Download className="size-4" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                <span>{updateActionLabel}</span>
              </Button>
            </div>
          }
        />
      </div>
    </SettingsPanelShell>
  )
}
