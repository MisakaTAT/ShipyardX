import { useEffect, useMemo, useState } from 'react'
import {
  getBundleType,
  getIdentifier,
  getName,
  getTauriVersion,
  getVersion,
  type BundleType,
} from '@tauri-apps/api/app'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { formatDateTimeString } from '@/shared/lib/datetime'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
import { formatBytes } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'

interface AppMetadata {
  name: string
  version: string
  tauriVersion: string
  identifier: string
  bundleType: BundleType
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'downloading' | 'installed' | 'error'

const BUNDLE_TYPE_LABELS: Record<BundleType, string> = {
  app: 'macOS App',
  appimage: 'AppImage',
  deb: 'DEB',
  msi: 'MSI',
  nsis: 'NSIS',
  rpm: 'RPM',
}

function formatProgress(downloadedBytes: number, totalBytes: number | null) {
  if (!Number.isFinite(downloadedBytes) || downloadedBytes <= 0) return '准备下载…'
  if (totalBytes && Number.isFinite(totalBytes) && totalBytes > 0) {
    const progress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    return `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${progress}%)`
  }
  return `已下载 ${formatBytes(downloadedBytes)}`
}

export function AppSettingsPanel() {
  const [appMetadata, setAppMetadata] = useState<AppMetadata | null>(null)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    void Promise.all([getName(), getVersion(), getTauriVersion(), getIdentifier(), getBundleType()])
      .then(([name, version, tauriVersion, identifier, bundleType]) => {
        if (cancelled) return
        setAppMetadata({ name, version, tauriVersion, identifier, bundleType })
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(getErrorMessage(error, '读取应用信息失败'), {
          description: getErrorDescription(error, '读取应用信息失败'),
        })
      })
      .finally(() => {
        if (cancelled) return
        setMetadataLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (!pendingUpdate) return
      void pendingUpdate.close().catch(() => undefined)
    }
  }, [pendingUpdate])

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

  const statusBadge = useMemo(() => {
    if (updateStatus === 'checking') return <Badge variant="outline">检查中</Badge>
    if (updateStatus === 'available') return <Badge>发现更新</Badge>
    if (updateStatus === 'latest') return <Badge variant="secondary">已是最新</Badge>
    if (updateStatus === 'downloading') return <Badge variant="outline">下载中</Badge>
    if (updateStatus === 'installed') return <Badge variant="secondary">等待重启</Badge>
    if (updateStatus === 'error') return <Badge variant="destructive">更新失败</Badge>
    return <Badge variant="outline">未检查</Badge>
  }, [updateStatus])

  const updateDescription =
    updateStatus === 'downloading'
      ? `正在下载更新包，${formatProgress(downloadedBytes, totalBytes)}`
      : updateStatus === 'installed'
        ? '新版本已准备完成，重启应用后即可生效'
        : updateStatus === 'latest'
          ? '当前已经是最新版本'
          : pendingUpdate
            ? `最新版本 ${pendingUpdate.version}${pendingUpdate.date ? `，发布于 ${formatDateTimeString(pendingUpdate.date)}` : ''}`
            : '查看是否有可用的新版本'

  const updateActionLabel =
    updateStatus === 'checking'
      ? '正在检查…'
      : updateStatus === 'downloading'
        ? '正在下载安装…'
        : pendingUpdate
          ? `安装 ${pendingUpdate.version}`
          : '检查更新'

  return (
    <SettingsPanelShell>
      <SettingsPanelHeader eyebrow="Application" title="应用" description="" />

      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title="应用名称"
          description="当前应用名称"
          action={
            metadataLoading ? (
              <div className="flex h-8 items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在读取…
              </div>
            ) : (
              <div className="text-sm text-foreground">{appMetadata?.name ?? '-'}</div>
            )
          }
        />

        <SettingsActionRow
          title="当前版本"
          description="当前安装的版本号"
          action={<div className="text-sm text-foreground">{appMetadata?.version ?? '-'}</div>}
        />

        <SettingsActionRow
          title="打包类型"
          description="当前安装包格式"
          action={
            <div className="text-sm text-foreground">
              {appMetadata ? (BUNDLE_TYPE_LABELS[appMetadata.bundleType] ?? appMetadata.bundleType) : '-'}
            </div>
          }
        />

        <SettingsActionRow
          title="Tauri 版本"
          description="当前运行时版本"
          action={<div className="text-sm text-foreground">{appMetadata?.tauriVersion ?? '-'}</div>}
        />

        <SettingsActionRow
          title="应用标识"
          description="当前应用标识"
          action={<div className="text-sm break-all text-foreground">{appMetadata?.identifier ?? '-'}</div>}
        />

        <SettingsActionRow
          title="更新状态"
          description={updateDescription}
          action={
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">{statusBadge}</div>
              {pendingUpdate?.body?.trim() ? (
                <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                  {pendingUpdate.body.trim()}
                </div>
              ) : null}
            </div>
          }
        />

        <SettingsActionRow
          title="检查更新"
          description="获取最新版本；如果有新版本，可直接下载并安装"
          action={
            <Button
              variant={pendingUpdate ? 'default' : 'outline'}
              className="w-full max-w-xs justify-center"
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
          }
        />
      </div>
    </SettingsPanelShell>
  )
}
