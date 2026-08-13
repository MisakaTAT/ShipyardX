import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, PackagePlus, Search, Settings2, Stone } from 'lucide-react'
import { useLocation } from 'wouter'
import { useApps, useAppStoreSync, useAppStoreSyncIndicator } from '@/features/appstore/api/use-appstore'
import { useServers } from '@/features/servers/api/use-servers'
import { useAppSettings } from '@/app/settings-store'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Spinner } from '@/shared/ui/spinner'
import { ActiveFilterChip } from '@/shared/components/active-filter-chip'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { CommandPaletteButton } from '@/features/command-palette/ui/command-palette-button'
import { AppDetailDialog } from '@/features/appstore/ui/app-detail-dialog'
import { TagFilterBar } from '@/features/appstore/ui/tag-filter-bar'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/shared/ui/select'
import { qk } from '@/shared/api/query-keys'
import { AppListItem, type AppstoreSyncProgress } from '@/types/app-bindings'
import { APP_PATHS } from '@/shared/lib/app-router'
import { usePageQuery } from '@/shared/hooks/use-page-query'
import { useSelectedAppSource } from '@/features/appstore/model/source-selection'
import { pickAppShortDesc, pickAppTags } from '@/features/appstore/model/app-locale'
import { cn } from '@/shared/lib/utils'

export default function AppStorePage() {
  const { t, i18n } = useTranslation()
  const [, navigate] = useLocation()
  const qc = useQueryClient()
  const { settings: appSettings } = useAppSettings()
  const sync = useAppStoreSync()
  const syncPercent = useAppStoreSyncIndicator(sync.isPending)
  const enabledSources = useMemo(
    () => appSettings.appstore.sources.filter((source) => source.enabled && source.repoUrl.trim()),
    [appSettings.appstore.sources]
  )
  const [activeSourceId, setSelectedSourceId] = useSelectedAppSource(enabledSources)
  const activeSource = enabledSources.find((source) => source.id === activeSourceId) ?? null
  const { data: apps = [], isLoading, isFetching } = useApps(activeSourceId || null)
  const { data: servers = [] } = useServers()
  const [switchingSource, setSwitchingSource] = useState(false)
  const { query: search, clearQuery } = usePageQuery(APP_PATHS.store)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<'readme' | 'install'>('readme')

  const language = i18n.language

  const allTags = useMemo(() => {
    const tags = new Map<string, number>()
    for (const app of apps) {
      for (const tag of pickAppTags(app, language)) {
        tags.set(tag, (tags.get(tag) || 0) + 1)
      }
    }
    return Array.from(tags.entries()).sort((a, b) => b[1] - a[1])
  }, [apps, language])

  // 中英文是两套分类，切语言后旧的选中项在新分类里不存在，会把列表筛成空
  useEffect(() => {
    setSelectedTags(new Set())
  }, [language])

  const filtered = useMemo(() => {
    let result = apps
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (app) =>
          app.name.toLowerCase().includes(q) ||
          app.key.toLowerCase().includes(q) ||
          pickAppShortDesc(app, language).toLowerCase().includes(q) ||
          Object.values(app.description).some((text) => text.toLowerCase().includes(q))
      )
    }
    if (selectedTags.size > 0) {
      result = result.filter((app) => pickAppTags(app, language).some((tag) => selectedTags.has(tag)))
    }
    return result
  }, [apps, search, selectedTags, language])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const handleSourceChange = async (sourceId: string) => {
    if (!sourceId || sourceId === activeSourceId) return
    setSwitchingSource(true)
    setSelectedSourceId(sourceId)
    await qc.invalidateQueries({ queryKey: qk.apps(sourceId) })
    setSwitchingSource(false)
  }

  if (isLoading || (isFetching && apps.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isEmpty = apps.length === 0

  return (
    <div className={`flex h-full flex-col ${!isEmpty ? 'gap-3' : ''}`}>
      {!isEmpty && (
        <div className="shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">{t('ui.appStore.title')}</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('ui.appStore.subtitle', { count: apps.length })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CommandPaletteButton />
              {enabledSources.length > 0 ? (
                <Select
                  value={activeSourceId}
                  onValueChange={(value) => {
                    if (!value) return
                    void handleSourceChange(value)
                  }}
                  disabled={sync.isPending || switchingSource}
                >
                  <SelectTrigger className="h-8 max-w-56 min-w-40 text-xs">
                    <span className="truncate">{activeSource?.name ?? t('ui.appStore.selectSource')}</span>
                  </SelectTrigger>
                  <SelectContent align="end">
                    {enabledSources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => navigate(`${APP_PATHS.settings}?section=appstore`)}
                aria-label={t('ui.appStore.openSettings')}
                disabled={switchingSource}
              >
                <Settings2 className="size-4" />
              </Button>
              {sync.isPending ? <SyncProgressPopover progress={syncPercent} initialSync={isEmpty} /> : null}
              <Button
                size="sm"
                onClick={() => sync.mutate()}
                disabled={sync.isPending || switchingSource || enabledSources.length === 0}
              >
                {sync.isPending ? <Spinner data-icon="inline-start" /> : null}
                <span>{sync.isPending ? t('ui.appStore.syncing') : t('ui.appStore.sync')}</span>
              </Button>
            </div>
          </div>

          {search ? <ActiveFilterChip query={search} count={filtered.length} onClear={clearQuery} /> : null}

          <TagFilterBar tags={allTags} selected={selectedTags} onToggle={toggleTag} />
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
          <div className="max-w-xs text-center">
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-7">
              {sync.isPending ? <Loader2 className="animate-spin" /> : <Stone />}
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              {sync.isPending ? t('ui.appStore.syncingTitle') : t('ui.appStore.notSyncedTitle')}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {sync.isPending ? t('ui.appStore.firstSyncHint') : t('ui.appStore.notSyncedBody')}
            </p>
            {sync.isPending ? (
              <SyncProgressBar progress={syncPercent} className="mt-4 text-left" compact />
            ) : (
              <div className="mt-5">
                <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
                  {t('ui.appStore.syncNow')}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Search className="mx-auto size-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">{t('ui.appStore.noMatch')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto pr-1">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((app) => (
              <AppCard
                key={app.key}
                app={app}
                onClick={() => {
                  setSelectedAppKey(app.key)
                  setDialogMode('readme')
                }}
                onInstall={(e) => {
                  e.stopPropagation()
                  setSelectedAppKey(app.key)
                  setDialogMode('install')
                }}
              />
            ))}
          </div>
        </div>
      )}

      <AppDetailDialog
        sourceId={activeSourceId || null}
        appKey={selectedAppKey}
        servers={servers}
        mode={dialogMode}
        onClose={() => setSelectedAppKey(null)}
      />
    </div>
  )
}

function SyncProgressBar({
  progress,
  className,
  compact = false,
}: {
  progress: AppstoreSyncProgress | null
  className?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const percent = progress ? Math.min(Math.max(Math.round(progress.percent ?? 0), 0), 100) : 0
  const hasStarted = !!progress && progress.total_objects > 0
  const detail = hasStarted
    ? t('ui.appStore.objectCount', { received: progress.received_objects, total: progress.total_objects })
    : t('ui.appStore.waitingRemote')
  const indexed =
    progress && progress.indexed_objects > 0 ? t('ui.appStore.indexed', { count: progress.indexed_objects }) : ''

  return (
    <div className={cn(compact ? 'space-y-3' : 'space-y-2', className)}>
      <div className={cn('flex items-end justify-between gap-3', compact ? 'justify-center' : '')}>
        {!compact ? <span className="text-xs text-muted-foreground">{t('ui.appStore.syncProgress')}</span> : null}
        <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">{percent}%</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-[width] duration-500 ease-out',
            hasStarted ? '' : 'opacity-0'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className={cn('text-[11px] text-muted-foreground', compact ? 'text-center' : '')}>
        {detail}
        {indexed}
      </p>
    </div>
  )
}

function SyncProgressPopover({
  progress,
  initialSync,
}: {
  progress: AppstoreSyncProgress | null
  initialSync: boolean
}) {
  const { t } = useTranslation()
  const percent = progress ? Math.min(Math.max(Math.round(progress.percent ?? 0), 0), 100) : 0

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent/40'
        )}
      >
        <span className="font-medium tabular-nums">{percent}%</span>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-3">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {initialSync ? t('ui.appStore.firstSyncTitle') : t('ui.appStore.syncing')}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {initialSync ? t('ui.appStore.firstSyncBody') : t('ui.appStore.updatingBody')}
            </p>
          </div>
          <SyncProgressBar progress={progress} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AppCard({
  app,
  onClick,
  onInstall,
}: {
  app: AppListItem
  onClick: () => void
  onInstall: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <div
      className="group cursor-pointer rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-accent/30"
      onClick={onClick}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {app.icon ? (
            <img src={`data:image/png;base64,${app.icon}`} alt={app.name} className="size-full object-cover" />
          ) : (
            <Stone className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-foreground">{app.name}</h3>
            <button
              className="ml-auto shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/10"
              title={t('ui.appStore.install')}
              onClick={onInstall}
            >
              <PackagePlus className="size-3.5 text-primary" />
            </button>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">
            {pickAppShortDesc(app, i18n.language) || t('ui.appStore.noDescription')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {pickAppTags(app, i18n.language)
              .slice(0, 3)
              .map((tag) => (
                <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {tag}
                </Badge>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
