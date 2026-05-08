import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  Construction,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Store,
  X,
} from 'lucide-react'
import { useApps, useAppStoreSync, type AppListItem } from '@/features/appstore/api/use-appstore'
import { useServers } from '@/features/servers/api/use-servers'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { SearchInput } from '@/shared/components'
import { AppDetailDialog } from '@/features/appstore/ui/app-detail-dialog'
import { InstalledAppsPanel } from '@/features/appstore/ui/installed-apps-panel'

const TAG_LABELS: Record<string, string> = {
  Tool: '工具',
  Runtime: '运行时',
  Website: '网站',
  Database: '数据库',
  Storage: '存储',
  Monitoring: '监控',
  AI: 'AI',
  VPN: 'VPN',
  CMS: 'CMS',
  DevOps: 'DevOps',
  Security: '安全',
  Media: '媒体',
  Game: '游戏',
  Other: '其他',
}

export default function AppStorePage() {
  const sync = useAppStoreSync()
  const { data: apps = [], isLoading } = useApps()
  const { data: servers = [] } = useServers()
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null)
  const [showInstalled, setShowInstalled] = useState(false)

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
          app.description.toLowerCase().includes(q),
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

  const clearFilters = () => {
    setSearch('')
    setSelectedTags(new Set())
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isEmpty = apps.length === 0

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">应用商店</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isEmpty
              ? '点击同步按钮从 1Panel 应用商店拉取应用列表'
              : `共 ${apps.length} 个应用，支持一键部署到远程服务器`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <Button variant="outline" size="sm" onClick={() => setShowInstalled(!showInstalled)}>
              {showInstalled ? <Store className="mr-1 size-4" /> : <CheckCircle2 className="mr-1 size-4" />}
              {showInstalled ? '应用商店' : '已安装'}
            </Button>
          )}
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 size-4" />
            )}
            同步商店
          </Button>
        </div>
      </div>

      {showInstalled ? (
        <InstalledAppsPanel />
      ) : isEmpty ? (
        /* Empty state - no apps synced */
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <Store className="size-7 text-primary" />
            </div>
            <Badge
              variant="outline"
              className="mb-3 gap-1 border-amber-500/25 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-400/95"
            >
              <Construction className="size-3" />
              首次使用
            </Badge>
            <h2 className="text-base font-semibold text-foreground">应用商店尚未同步</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              应用商店数据来自 1Panel 官方应用商店 (github.com/1Panel-dev/appstore)。
              点击上方「同步商店」按钮即可获取数百款精选应用。
            </p>
            <div className="mt-5">
              <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
                {sync.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Download className="mr-1 size-4" />
                )}
                立即同步
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Search & Filters */}
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="搜索应用 (名称、关键词)..."
                className="max-w-sm"
              />
              {(search || selectedTags.size > 0) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-3" />
                  清除筛选
                </Button>
              )}
            </div>

            {/* Tag filters */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allTags.map(([tag, count]) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.has(tag) ? 'default' : 'outline'}
                    className="cursor-pointer text-[11px] transition-colors"
                    onClick={() => toggleTag(tag)}
                  >
                    {TAG_LABELS[tag] || tag}
                    <span className="ml-1 text-[10px] opacity-60">{count}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* App Grid */}
          {filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Search className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-2 text-sm text-muted-foreground">没有找到匹配的应用</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {filtered.map((app) => (
                  <AppCard
                    key={app.key}
                    app={app}
                    onClick={() => setSelectedAppKey(app.key)}
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
        onClose={() => setSelectedAppKey(null)}
      />
    </div>
  )
}

function AppCard({ app, onClick }: { app: AppListItem; onClick: () => void }) {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-accent/30"
      onClick={onClick}
    >
      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {app.icon ? (
            <img
              src={`data:image/png;base64,${app.icon}`}
              alt={app.name}
              className="size-full object-cover"
            />
          ) : (
            <Store className="size-5 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-foreground">{app.name}</h3>
            {app.installed && (
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {app.short_desc_zh || app.description || '暂无描述'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {app.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                {TAG_LABELS[tag] || tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
