import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { commands, type AppstoreCacheInfo, type AppstoreSettings } from '@/types/app-bindings'
import { toast } from '@/shared/components/toast'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/button'
import { Switch } from '@/shared/ui/switch'
import { Input } from '@/shared/ui/input'

const SETTINGS_CONTROL_CLASSNAME = 'h-8 rounded-lg border-border bg-card px-3 py-0 text-sm leading-none shadow-none'

const SETTINGS_TOGGLE_CLASSNAME = 'flex h-8 w-fit items-center gap-3'

interface AppStoreSettingsPanelProps {
  repoUrl: string
  proxyEnabled: boolean
  proxyUrl: string
  onChange: (patch: { repoUrl?: string; proxyEnabled?: boolean; proxyUrl?: string }) => void
  onReset: () => void
}

export function AppStoreSettingsPanel({
  repoUrl,
  proxyEnabled,
  proxyUrl,
  onChange,
  onReset,
}: AppStoreSettingsPanelProps) {
  const [cacheInfo, setCacheInfo] = useState<AppstoreCacheInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const refreshCacheInfo = useCallback(async () => {
    setLoading(true)
    try {
      const data = await commands.getAppstoreCacheInfo()
      setCacheInfo(data)
    } catch (error) {
      toast.error(getErrorMessage(error, '读取应用商店缓存失败'), {
        description: getErrorDescription(error),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void commands
      .getAppstoreSettings()
      .then((settings) => {
        if (cancelled) return
        onChangeRef.current({
          repoUrl: settings.repo_url,
          proxyEnabled: settings.proxy_enabled,
          proxyUrl: settings.proxy_url,
        })
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(getErrorMessage(error, '读取应用商店设置失败'), {
          description: getErrorDescription(error),
        })
      })

    void refreshCacheInfo()
    return () => {
      cancelled = true
    }
  }, [refreshCacheInfo])

  const saveSettings = async (next: AppstoreSettings) => {
    setSaving(true)
    try {
      const saved = await commands.updateAppstoreSettings(next)
      onChange({
        repoUrl: saved.repo_url,
        proxyEnabled: saved.proxy_enabled,
        proxyUrl: saved.proxy_url,
      })
      toast.success('应用商店设置已保存')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存应用商店设置失败'), {
        description: getErrorDescription(error),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleProxyEnabledChange = async (checked: boolean) => {
    await saveSettings({
      repo_url: repoUrl,
      proxy_enabled: checked,
      proxy_url: proxyUrl,
    })
  }

  const handleRepoUrlBlur = async () => {
    await saveSettings({
      repo_url: repoUrl,
      proxy_enabled: proxyEnabled,
      proxy_url: proxyUrl,
    })
  }

  const handleProxyUrlBlur = async () => {
    await saveSettings({
      repo_url: repoUrl,
      proxy_enabled: proxyEnabled,
      proxy_url: proxyUrl,
    })
  }

  const handleReset = async () => {
    onReset()
    await saveSettings({
      repo_url: 'https://github.com/1Panel-dev/appstore.git',
      proxy_enabled: false,
      proxy_url: 'http://127.0.0.1:7890',
    })
  }

  const handleClearCache = async () => {
    setClearing(true)
    try {
      await commands.clearAppstoreCache()
      toast.success('应用商店缓存已清除')
      await refreshCacheInfo()
    } catch (error) {
      toast.error(getErrorMessage(error, '清除应用商店缓存失败'), {
        description: getErrorDescription(error),
      })
    } finally {
      setClearing(false)
    }
  }

  return (
    <SettingsPanelShell>
      <SettingsPanelHeader
        eyebrow="App Store"
        title="应用商店"
        actions={
          <Button size="sm" onClick={() => void handleReset()} disabled={saving}>
            <RotateCcw className="size-3.5" />
            恢复默认
          </Button>
        }
      />

      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title="缓存目录"
          description="当前应用商店仓库的本地缓存位置"
          action={
            <div className="w-full max-w-xs text-sm break-all text-foreground">{cacheInfo?.cache_dir ?? '-'}</div>
          }
        />

        <SettingsActionRow
          title="缓存大小"
          description="包含应用商店仓库与已下载数据"
          action={
            loading ? (
              <div className="flex h-8 w-full max-w-xs items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在读取…
              </div>
            ) : (
              <div className="w-full max-w-xs text-sm text-foreground">{cacheInfo?.size ?? '0 B'}</div>
            )
          }
        />

        <SettingsActionRow
          title="清除缓存"
          description="删除本地应用商店缓存"
          action={
            <Button
              variant="outline"
              className="w-full max-w-xs justify-center"
              onClick={() => void handleClearCache()}
              disabled={clearing}
            >
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              <span>{clearing ? '正在清除…' : '清除缓存'}</span>
            </Button>
          }
        />

        <SettingsActionRow
          title="仓库地址"
          description="应用商店仓库地址"
          action={
            <div className="w-full max-w-xs">
              <Input
                value={repoUrl}
                onChange={(event) => onChange({ repoUrl: event.target.value })}
                onBlur={() => void handleRepoUrlBlur()}
                placeholder="https://github.com/1Panel-dev/appstore.git"
                disabled={saving}
                className={SETTINGS_CONTROL_CLASSNAME}
              />
            </div>
          }
        />

        <SettingsActionRow
          title="启用代理"
          description="同步应用商店时通过代理访问 GitHub"
          action={
            <label className={SETTINGS_TOGGLE_CLASSNAME}>
              <Switch checked={proxyEnabled} onCheckedChange={(checked) => void handleProxyEnabledChange(checked)} />
            </label>
          }
        />

        <SettingsActionRow
          title="代理地址"
          description="支持 libgit2 可识别的 HTTP 代理地址，例如 http://127.0.0.1:7890"
          action={
            <div className="w-full max-w-xs">
              <Input
                value={proxyUrl}
                onChange={(event) => onChange({ proxyUrl: event.target.value })}
                onBlur={() => void handleProxyUrlBlur()}
                placeholder="http://127.0.0.1:7890"
                disabled={saving}
                className={SETTINGS_CONTROL_CLASSNAME}
              />
            </div>
          }
        />
      </div>
    </SettingsPanelShell>
  )
}
