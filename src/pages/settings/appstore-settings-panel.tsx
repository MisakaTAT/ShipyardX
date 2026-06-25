import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { commands, type AppstoreCacheInfo } from '@/types/app-bindings'
import { toast } from '@/shared/components/toast'
import {
  DEFAULT_APPSTORE_SOURCES,
  fromCommandAppstoreSettings,
  toCommandAppstoreSettings,
  type LocalAppstoreSettings,
} from '@/shared/lib/appstore-settings'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Switch } from '@/shared/ui/switch'

const SETTINGS_CONTROL_CLASSNAME = 'h-6 rounded-sm border-border bg-card px-2 text-xs leading-none shadow-none'
const SETTINGS_TOGGLE_CLASSNAME = 'flex h-6 w-fit items-center gap-2'

export interface AppStorePanelSettings extends LocalAppstoreSettings {}

interface AppStoreSettingsPanelProps {
  settings: AppStorePanelSettings
  onChange: (next: AppStorePanelSettings) => void
  onReset: () => void
}

function createSourceDraft() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id: `source-${suffix}`,
    name: '',
    repoUrl: '',
    enabled: true,
  }
}

export function AppStoreSettingsPanel({ settings, onChange, onReset }: AppStoreSettingsPanelProps) {
  const [cacheInfo, setCacheInfo] = useState<AppstoreCacheInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [draftSources, setDraftSources] = useState<AppStorePanelSettings['sources']>([])
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
      .then((next) => {
        if (cancelled) return
        setDraftSources([])
        onChangeRef.current(fromCommandAppstoreSettings(next))
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

  const saveSettings = async (next: AppStorePanelSettings, successMessage = '应用商店设置已保存') => {
    setSaving(true)
    try {
      const saved = await commands.updateAppstoreSettings(toCommandAppstoreSettings(next))
      onChange(fromCommandAppstoreSettings(saved))
      toast.success(successMessage)
    } catch (error) {
      toast.error(getErrorMessage(error, '保存应用商店设置失败'), {
        description: getErrorDescription(error),
      })
    } finally {
      setSaving(false)
    }
  }

  const buildPatchedSettings = (
    sourceId: string,
    patch: Partial<(typeof settings.sources)[number]>
  ): AppStorePanelSettings => ({
    ...settings,
    sources: settings.sources.map((source) => (source.id === sourceId ? { ...source, ...patch } : source)),
  })

  const patchSource = (sourceId: string, patch: Partial<(typeof settings.sources)[number]>) => {
    onChange(buildPatchedSettings(sourceId, patch))
  }

  const patchDraftSource = (sourceId: string, patch: Partial<(typeof draftSources)[number]>) => {
    setDraftSources((current) => current.map((source) => (source.id === sourceId ? { ...source, ...patch } : source)))
  }

  const handleDraftSourceBlur = async (sourceId: string) => {
    const draft = draftSources.find((source) => source.id === sourceId)
    if (!draft || !draft.repoUrl.trim()) return

    const next = {
      ...settings,
      sources: [...settings.sources, { ...draft, repoUrl: draft.repoUrl.trim() }],
    }
    onChange(next)
    setDraftSources((current) => current.filter((source) => source.id !== sourceId))
    await saveSettings(next, '应用商店源已添加')
  }

  const handleAddSource = () => {
    setDraftSources((current) => [...current, createSourceDraft()])
  }

  const handleToggleSourceEnabled = async (sourceId: string, enabled: boolean) => {
    const enabledCount = settings.sources.filter((source) => source.enabled).length
    if (!enabled && enabledCount <= 1) {
      toast.error('至少保留一个启用源')
      return
    }

    const next = {
      ...settings,
      sources: settings.sources.map((source) => (source.id === sourceId ? { ...source, enabled } : source)),
    }
    onChange(next)
    await saveSettings(next, enabled ? '应用商店源已启用' : '应用商店源已禁用')
  }

  const handleRemoveSource = async (sourceId: string) => {
    if (draftSources.some((source) => source.id === sourceId)) {
      setDraftSources((current) => current.filter((source) => source.id !== sourceId))
      return
    }
    if (settings.sources.length <= 1) {
      toast.error('至少保留一个应用商店源')
      return
    }
    const nextSources = settings.sources.filter((source) => source.id !== sourceId)
    if (!nextSources.some((source) => source.enabled) && nextSources[0]) {
      nextSources[0] = { ...nextSources[0], enabled: true }
    }
    const next = {
      ...settings,
      sources: nextSources,
    }
    onChange(next)
    await saveSettings(next, '应用商店源已删除')
  }

  const handleReset = async () => {
    onReset()
    setDraftSources([])
    await saveSettings(
      {
        sources: DEFAULT_APPSTORE_SOURCES.map((source) => ({ ...source })),
        proxyEnabled: false,
        proxyUrl: 'http://127.0.0.1:7890',
      },
      '应用商店设置已恢复默认'
    )
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
        <div className="py-2">
          <div className="mb-1.5">
            <h3 className="text-sm font-medium text-foreground">应用源</h3>
            <p className="mt-1 text-xs text-muted-foreground">维护可用仓库列表，商店页面再选择当前使用的源。</p>
          </div>

          <div className="space-y-1">
            {settings.sources.map((source) => (
              <div key={source.id} className="grid grid-cols-[128px_minmax(0,1fr)_44px_28px] gap-1.5 px-0.5">
                <Input
                  value={source.name}
                  onChange={(event) => patchSource(source.id, { name: event.target.value })}
                  onBlur={(event) => void saveSettings(buildPatchedSettings(source.id, { name: event.target.value }))}
                  placeholder="仓库名称"
                  disabled={saving}
                  className={SETTINGS_CONTROL_CLASSNAME}
                />
                <Input
                  value={source.repoUrl}
                  onChange={(event) => patchSource(source.id, { repoUrl: event.target.value })}
                  onBlur={(event) =>
                    void saveSettings(buildPatchedSettings(source.id, { repoUrl: event.target.value }))
                  }
                  placeholder={DEFAULT_APPSTORE_SOURCES[0].repoUrl}
                  disabled={saving}
                  className={SETTINGS_CONTROL_CLASSNAME}
                />
                <div className="flex h-6 items-center justify-center">
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={(checked) => void handleToggleSourceEnabled(source.id, checked)}
                    disabled={saving}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRemoveSource(source.id)}
                    disabled={saving || settings.sources.length <= 1}
                    className="h-6 w-6 px-0"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {draftSources.map((source) => (
              <div key={source.id} className="grid grid-cols-[128px_minmax(0,1fr)_44px_28px] gap-1.5 px-0.5">
                <Input
                  value={source.name}
                  onChange={(event) => patchDraftSource(source.id, { name: event.target.value })}
                  onBlur={() => void handleDraftSourceBlur(source.id)}
                  placeholder="仓库名称"
                  disabled={saving}
                  className={SETTINGS_CONTROL_CLASSNAME}
                />
                <Input
                  value={source.repoUrl}
                  onChange={(event) => patchDraftSource(source.id, { repoUrl: event.target.value })}
                  onBlur={() => void handleDraftSourceBlur(source.id)}
                  placeholder={DEFAULT_APPSTORE_SOURCES[0].repoUrl}
                  disabled={saving}
                  className={SETTINGS_CONTROL_CLASSNAME}
                />
                <div className="flex h-6 items-center justify-center">
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={(checked) => patchDraftSource(source.id, { enabled: checked })}
                    disabled={saving}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRemoveSource(source.id)}
                    disabled={saving}
                    className="h-6 w-6 px-0"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-1.5 px-0.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleAddSource()}
              disabled={saving}
              className="h-7 w-full border-dashed px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" />
              添加源
            </Button>
          </div>
        </div>

        <SettingsActionRow
          title="启用代理"
          description="同步应用商店时统一走全局代理。"
          action={
            <label className={SETTINGS_TOGGLE_CLASSNAME}>
              <Switch
                checked={settings.proxyEnabled}
                onCheckedChange={(checked) => {
                  const next = { ...settings, proxyEnabled: checked }
                  onChange(next)
                  void saveSettings(next)
                }}
              />
            </label>
          }
        />

        <SettingsActionRow
          title="代理地址"
          description="支持 HTTP 代理地址，例如 http://127.0.0.1:7890。"
          action={
            <div className="w-full max-w-xs">
              <Input
                value={settings.proxyUrl}
                onChange={(event) => onChange({ ...settings, proxyUrl: event.target.value })}
                onBlur={(event) => void saveSettings({ ...settings, proxyUrl: event.target.value })}
                placeholder="http://127.0.0.1:7890"
                disabled={saving}
                className={SETTINGS_CONTROL_CLASSNAME}
              />
            </div>
          }
        />

        <SettingsActionRow
          title="缓存目录"
          description="应用商店仓库与元数据的本地缓存位置。"
          action={
            <div className="w-full max-w-xs text-sm break-all text-foreground">{cacheInfo?.cache_dir ?? '-'}</div>
          }
        />

        <SettingsActionRow
          title="缓存大小"
          description="当前本地缓存占用空间。"
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
          description="删除本地缓存，下次进入商店时会重新拉取。"
          action={
            <Button
              variant="outline"
              className="h-7 w-full max-w-xs justify-center px-2.5"
              onClick={() => void handleClearCache()}
              disabled={clearing}
            >
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              <span>{clearing ? '正在清除…' : '清除缓存'}</span>
            </Button>
          }
        />
      </div>
    </SettingsPanelShell>
  )
}
