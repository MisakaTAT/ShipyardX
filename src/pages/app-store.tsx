import { useState, useMemo } from 'react'
import { Loader2, PackagePlus, RefreshCw, Search, Settings2, Stone } from 'lucide-react'
import { useLocation } from 'wouter'
import { useApps, useAppStoreSync, useAppStoreSyncIndicator } from '@/features/appstore/api/use-appstore'
import { useServers } from '@/features/servers/api/use-servers'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { SearchInput } from '@/shared/components'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { AppDetailDialog } from '@/features/appstore/ui/app-detail-dialog'
import { AppListItem, type AppstoreSyncProgress } from '@/types/app-bindings'
import { APP_PATHS } from '@/shared/lib/app-router'
import { cn } from '@/shared/lib/utils'
export default function AppStorePage() {
  const [, navigate] = useLocation()
  const sync = useAppStoreSync()
  const syncPercent = useAppStoreSyncIndicator(sync.isPending)
  const { data: apps = [], isLoading, isFetching } = useApps()
  const { data: servers = [] } = useServers()
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<'readme' | 'install'>('readme')
  const allTags = useMemo(() => {
    const tags = new Map<string, number>()
    for (const app of apps) {
      for (const tag of app.tags) {
        tags.set(tag, (tags.get(tag) || 0) + 1)
      }
    }
    return Array.from(tags.entries()).sort((a, b) => b[1] - a[1])
  }, [apps])

  const filtered = useMemo(() => {
    let result = apps
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (app) =>
          app.name.toLowerCase().includes(q) ||
          app.key.toLowerCase().includes(q) ||
          app.short_desc_zh.toLowerCase().includes(q) ||
          app.description.toLowerCase().includes(q)
      )
    }
    if (selectedTags.size > 0) {
      result = result.filter((app) => app.tags.some((t) => selectedTags.has(t)))
    }
    return result
  }, [apps, search, selectedTags])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
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
              <h1 className="text-lg font-semibold text-foreground">应用商店</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                浏览和安装商店中的应用，一键部署到远程服务器，共 {apps.length} 个应用。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => navigate(`${APP_PATHS.settings}?section=appstore`)}
                aria-label="打开应用商店设置"
              >
                <Settings2 className="size-4" />
              </Button>
              {sync.isPending ? <SyncProgressPopover progress={syncPercent} initialSync={isEmpty} /> : null}
              <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
                {sync.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 size-4" />
                )}
                {sync.isPending ? '同步中...' : '同步'}
              </Button>
            </div>
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="搜索应用 (名称、关键词)..."
            className="mt-3 w-full"
          />

          {allTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {allTags.map(([tag, count]) => (
                <Badge
                  key={tag}
                  variant={selectedTags.has(tag) ? 'default' : 'outline'}
                  className="cursor-pointer text-[11px] transition-colors"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                  <span className="ml-1 text-[10px] opacity-60">{count}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {isEmpty ? (
        /* Empty state - no apps synced */
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
          <div className="max-w-xs text-center">
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-7">
              {sync.isPending ? <Loader2 className="animate-spin" /> : <Stone />}
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              {sync.isPending ? '正在同步应用商店' : '尚未同步应用商店'}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {sync.isPending
                ? '首次同步可能需要一点时间'
                : '同步应用仓库后，可在此浏览和搜索数百款精选应用，选择您需要的版本并一键部署到服务器'}
            </p>
            {sync.isPending ? (
              <SyncProgressBar progress={syncPercent} className="mt-4 text-left" compact />
            ) : (
              <div className="mt-5">
                <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
                  <RefreshCw className="mr-1 size-4" />
                  立即同步
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* App Grid */}
          {filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Search className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-2 text-sm text-muted-foreground">未找到匹配的应用</p>
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
        </>
      )}

      {/* Detail Dialog */}
      <AppDetailDialog
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
  const percent = progress ? Math.min(Math.max(Math.round(progress.percent ?? 0), 0), 100) : 0
  const hasStarted = !!progress && progress.total_objects > 0
  const detail = hasStarted
    ? `${progress.received_objects} / ${progress.total_objects} 个对象`
    : '正在等待远端返回对象信息'
  const indexed = progress && progress.indexed_objects > 0 ? `，已处理 ${progress.indexed_objects} 个对象` : ''

  return (
    <div className={cn(compact ? 'space-y-3' : 'space-y-2', className)}>
      <div className={cn('flex items-end justify-between gap-3', compact ? 'justify-center' : '')}>
        {!compact ? <span className="text-xs text-muted-foreground">同步进度</span> : null}
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
  const percent = progress ? Math.min(Math.max(Math.round(progress.percent ?? 0), 0), 100) : 0

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent/40'
        )}
      >
        <span className="font-medium tabular-nums">{percent}%</span>
        <span className="text-muted-foreground">查看进度</span>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-3">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-foreground">正在同步应用商店</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {initialSync ? '首次同步可能需要一点时间' : '正在获取应用商店最新内容'}
            </div>
          </div>
          <SyncProgressBar progress={progress} compact />
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
  onInstall: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-accent/30"
      onClick={onClick}
    >
      <div className="flex items-start gap-2.5">
        {/* Icon */}
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
              title="安装"
              onClick={onInstall}
            >
              <PackagePlus className="size-3.5 text-primary" />
            </button>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">
            {app.short_desc_zh || app.description || '暂无描述'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {app.tags.slice(0, 3).map((tag) => (
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
