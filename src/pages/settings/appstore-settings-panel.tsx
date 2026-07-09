import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
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
import {
  useAppStoreCacheInfo,
  useAppStoreSettings,
  useClearAppStoreCache,
  useUpdateAppStoreSettings,
} from '@/features/appstore/api/use-appstore'
import { useSavedDraft } from '@/shared/hooks/use-saved-draft'

const SETTINGS_CONTROL_CLASSNAME = 'h-6 rounded-sm border-border bg-card px-2 text-xs leading-none shadow-none'
const SETTINGS_TOGGLE_CLASSNAME = 'flex h-6 w-fit items-center gap-2'

export type AppStorePanelSettings = LocalAppstoreSettings
type AppStoreSource = AppStorePanelSettings['sources'][number]

interface AppStoreSettingsPanelProps {
  settings: AppStorePanelSettings
  onSavedChange: (next: AppStorePanelSettings) => void
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

function fingerprint(settings: AppStorePanelSettings) {
  return JSON.stringify(toCommandAppstoreSettings(settings))
}

export function AppStoreSettingsPanel({ settings, onSavedChange }: AppStoreSettingsPanelProps) {
  const { data: remoteSettings } = useAppStoreSettings(toCommandAppstoreSettings(settings))
  const { data: cacheInfo, isLoading: loading, refetch: refreshCacheInfo } = useAppStoreCacheInfo()
  const updateSettings = useUpdateAppStoreSettings()
  const clearCache = useClearAppStoreCache()
  const lastSyncedHashRef = useRef<string>('')

  const savedSettings = useMemo(
    () => (remoteSettings ? fromCommandAppstoreSettings(remoteSettings) : settings),
    [remoteSettings, settings]
  )

  const { draft, setDraft, replaceSaved } = useSavedDraft(savedSettings, {
    isEqual: (left, right) => fingerprint(left) === fingerprint(right),
  })

  useEffect(() => {
    const nextHash = fingerprint(savedSettings)
    if (lastSyncedHashRef.current === nextHash) return
    lastSyncedHashRef.current = nextHash
    onSavedChange(savedSettings)
  }, [onSavedChange, savedSettings])

  const persistSettings = useCallback(
    async (next: AppStorePanelSettings, options?: { successMessage?: string; silent?: boolean }) => {
      if (fingerprint(next) === fingerprint(savedSettings)) return

      try {
        const saved = await updateSettings.mutateAsync(toCommandAppstoreSettings(next))
        const normalized = fromCommandAppstoreSettings(saved)
        replaceSaved(normalized)
        lastSyncedHashRef.current = fingerprint(normalized)
        onSavedChange(normalized)
        if (!options?.silent) {
          toast.success(options?.successMessage ?? '应用商店设置已保存')
        }
      } catch (error) {
        toast.error(getErrorMessage(error, '保存应用商店设置失败'), {
          description: getErrorDescription(error),
        })
      }
    },
    [onSavedChange, replaceSaved, savedSettings, updateSettings]
  )

  const buildPatchedSettings = useCallback(
    (sourceId: string, patch: Partial<AppStoreSource>): AppStorePanelSettings => ({
      ...draft,
      sources: draft.sources.map((source) => (source.id === sourceId ? { ...source, ...patch } : source)),
    }),
    [draft]
  )

  const patchSource = useCallback(
    (sourceId: string, patch: Partial<AppStoreSource>) => {
      setDraft((current) => ({
        ...current,
        sources: current.sources.map((source) => (source.id === sourceId ? { ...source, ...patch } : source)),
      }))
    },
    [setDraft]
  )

  const handleSourceBlur = async (sourceId: string) => {
    const source = draft.sources.find((item) => item.id === sourceId)
    if (!source) return
    await persistSettings(buildPatchedSettings(sourceId, { repoUrl: source.repoUrl.trim() }))
  }

  const handleAddSource = () => {
    setDraft((current) => ({
      ...current,
      sources: [...current.sources, createSourceDraft()],
    }))
  }

  const handleToggleSourceEnabled = async (sourceId: string, enabled: boolean) => {
    const enabledCount = draft.sources.filter((source) => source.enabled).length
    if (!enabled && enabledCount <= 1) {
      toast.error('至少保留一个启用源')
      return
    }

    const next = {
      ...draft,
      sources: draft.sources.map((source) => (source.id === sourceId ? { ...source, enabled } : source)),
    }
    setDraft(next)
    await persistSettings(next, { successMessage: enabled ? '应用商店源已启用' : '应用商店源已禁用' })
  }

  const handleRemoveSource = async (sourceId: string) => {
    if (draft.sources.length <= 1) {
      toast.error('至少保留一个应用商店源')
      return
    }

    const nextSources = draft.sources.filter((source) => source.id !== sourceId)
    if (!nextSources.some((source) => source.enabled) && nextSources[0]) {
      nextSources[0] = { ...nextSources[0], enabled: true }
    }

    const next = {
      ...draft,
      sources: nextSources,
    }
    setDraft(next)
    await persistSettings(next, { successMessage: '应用商店源已删除' })
  }

  const handleReset = async () => {
    const next = {
      sources: DEFAULT_APPSTORE_SOURCES.map((source) => ({ ...source })),
      proxyEnabled: false,
      proxyUrl: 'http://127.0.0.1:7890',
    }
    setDraft(next)
    await persistSettings(next, { successMessage: '应用商店设置已恢复默认' })
  }

  const handleClearCache = async () => {
    try {
      await clearCache.mutateAsync()
      toast.success('应用商店缓存已清除')
      await refreshCacheInfo()
    } catch (error) {
      toast.error(getErrorMessage(error, '清除应用商店缓存失败'), {
        description: getErrorDescription(error),
      })
    }
  }

  const saving = updateSettings.isPending
  const clearing = clearCache.isPending

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
            <p className="mt-1 text-xs text-muted-foreground">维护可用仓库列表，商店页面再选择当前使用的源</p>
          </div>

          <div className="space-y-1">
            {draft.sources.map((source) => (
              <div key={source.id} className="grid grid-cols-[128px_minmax(0,1fr)_44px_28px] gap-1.5 px-0.5">
                <Input
                  value={source.name}
                  onChange={(event) => patchSource(source.id, { name: event.target.value })}
                  onBlur={(event) =>
                    void persistSettings(buildPatchedSettings(source.id, { name: event.target.value }))
                  }
                  placeholder="仓库名称"
                  disabled={saving}
                  className={SETTINGS_CONTROL_CLASSNAME}
                />
                <Input
                  value={source.repoUrl}
                  onChange={(event) => patchSource(source.id, { repoUrl: event.target.value })}
                  onBlur={() => void handleSourceBlur(source.id)}
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
                    disabled={saving || draft.sources.length <= 1}
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
          description="同步应用商店时统一走全局代理"
          action={
            <label className={SETTINGS_TOGGLE_CLASSNAME}>
              <Switch
                checked={draft.proxyEnabled}
                onCheckedChange={(checked) => {
                  const next = { ...draft, proxyEnabled: checked }
                  setDraft(next)
                  void persistSettings(next)
                }}
              />
            </label>
          }
        />

        <SettingsActionRow
          title="代理地址"
          description="支持 HTTP 代理地址，例如 http://127.0.0.1:7890"
          action={
            <div className="w-full max-w-xs">
              <Input
                value={draft.proxyUrl}
                onChange={(event) => setDraft((current) => ({ ...current, proxyUrl: event.target.value }))}
                onBlur={(event) => void persistSettings({ ...draft, proxyUrl: event.target.value })}
                placeholder="http://127.0.0.1:7890"
                disabled={saving}
                className={SETTINGS_CONTROL_CLASSNAME}
              />
            </div>
          }
        />

        <SettingsActionRow
          title="缓存目录"
          description="应用商店仓库与元数据的本地缓存位置"
          action={
            <div className="w-full max-w-xs text-sm break-all text-foreground">{cacheInfo?.cache_dir ?? '-'}</div>
          }
        />

        <SettingsActionRow
          title="缓存大小"
          description="当前本地缓存占用空间"
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
          description="删除本地缓存，下次进入商店时会重新拉取"
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
