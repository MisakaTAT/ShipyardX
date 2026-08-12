import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { SettingsActionRow, SettingsPanelShell, SettingsResetRow } from '@/pages/settings/settings-panel-shell'
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

const SETTINGS_CONTROL_CLASSNAME = 'h-8 rounded-lg border-border bg-card px-3 py-0 text-sm leading-none shadow-none'
const SETTINGS_TOGGLE_CLASSNAME = 'flex h-8 w-fit items-center gap-3'

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
  const { t } = useTranslation()
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
          toast.success(options?.successMessage ?? t('ui.settings.appstore.toast.saved'))
        }
      } catch (error) {
        toast.error(getErrorMessage(error, t('ui.settings.appstore.toast.saveFailed')), {
          description: getErrorDescription(error),
        })
      }
    },
    [onSavedChange, replaceSaved, savedSettings, updateSettings, t]
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
      toast.error(t('ui.settings.appstore.toast.keepOneEnabled'))
      return
    }

    const next = {
      ...draft,
      sources: draft.sources.map((source) => (source.id === sourceId ? { ...source, enabled } : source)),
    }
    setDraft(next)
    await persistSettings(next, {
      successMessage: enabled
        ? t('ui.settings.appstore.toast.sourceEnabled')
        : t('ui.settings.appstore.toast.sourceDisabled'),
    })
  }

  const handleRemoveSource = async (sourceId: string) => {
    if (draft.sources.length <= 1) {
      toast.error(t('ui.settings.appstore.toast.keepOneSource'))
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
    await persistSettings(next, { successMessage: t('ui.settings.appstore.toast.sourceRemoved') })
  }

  const handleReset = async () => {
    const next = {
      sources: DEFAULT_APPSTORE_SOURCES.map((source) => ({ ...source })),
      proxyEnabled: false,
      proxyUrl: 'http://127.0.0.1:7890',
    }
    setDraft(next)
    await persistSettings(next, { successMessage: t('ui.settings.appstore.toast.reset') })
  }

  const handleClearCache = async () => {
    try {
      await clearCache.mutateAsync()
      toast.success(t('ui.settings.appstore.toast.cacheCleared'))
      await refreshCacheInfo()
    } catch (error) {
      toast.error(getErrorMessage(error, t('ui.settings.appstore.toast.cacheClearFailed')), {
        description: getErrorDescription(error),
      })
    }
  }

  const saving = updateSettings.isPending
  const clearing = clearCache.isPending

  return (
    <SettingsPanelShell>
      <div className="divide-y divide-border/70">
        <div className="py-5">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-foreground">{t('ui.settings.appstore.sources.title')}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('ui.settings.appstore.sources.description')}
            </p>
          </div>

          <div className="space-y-2">
            {draft.sources.map((source) => (
              <div key={source.id} className="grid grid-cols-[140px_minmax(0,1fr)_44px_32px] gap-2 px-0.5">
                <Input
                  value={source.name}
                  onChange={(event) => patchSource(source.id, { name: event.target.value })}
                  onBlur={(event) =>
                    void persistSettings(buildPatchedSettings(source.id, { name: event.target.value }))
                  }
                  placeholder={t('ui.settings.appstore.sources.namePlaceholder')}
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
                <div className="flex h-8 items-center justify-center">
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={(checked) => void handleToggleSourceEnabled(source.id, checked)}
                    disabled={saving}
                  />
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t('ui.settings.appstore.sources.delete')}
                  onClick={() => void handleRemoveSource(source.id)}
                  disabled={saving || draft.sources.length <= 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-2 px-0.5">
            <Button
              variant="outline"
              onClick={() => void handleAddSource()}
              disabled={saving}
              className="w-full border-dashed text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-4" />
              {t('ui.settings.appstore.sources.add')}
            </Button>
          </div>
        </div>

        <SettingsActionRow
          title={t('ui.settings.appstore.proxy.enableTitle')}
          description={t('ui.settings.appstore.proxy.enableDesc')}
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
          title={t('ui.settings.appstore.proxy.urlTitle')}
          description={t('ui.settings.appstore.proxy.urlDesc')}
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
          title={t('ui.settings.appstore.cache.dirTitle')}
          description={t('ui.settings.appstore.cache.dirDesc')}
          action={
            <div className="w-full max-w-xs text-sm break-all text-foreground">{cacheInfo?.cache_dir ?? '-'}</div>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.appstore.cache.sizeTitle')}
          description={t('ui.settings.appstore.cache.sizeDesc')}
          action={
            loading ? (
              <div className="flex h-8 w-full max-w-xs items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t('ui.common.loading')}
              </div>
            ) : (
              <div className="w-full max-w-xs text-sm text-foreground">{cacheInfo?.size ?? '0 B'}</div>
            )
          }
        />

        <SettingsActionRow
          title={t('ui.settings.appstore.cache.clearTitle')}
          description={t('ui.settings.appstore.cache.clearDesc')}
          action={
            <Button
              variant="outline"
              className="w-full max-w-xs justify-center"
              onClick={() => void handleClearCache()}
              disabled={clearing}
            >
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              <span>{clearing ? t('ui.settings.appstore.cache.clearing') : t('ui.settings.appstore.cache.clear')}</span>
            </Button>
          }
        />

        <SettingsResetRow
          description={t('ui.settings.appstore.resetDesc')}
          onReset={() => void handleReset()}
          disabled={saving}
        />
      </div>
    </SettingsPanelShell>
  )
}
