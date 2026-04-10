import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Activity,
  Trash2,
  Box,
  Layers,
  Share2,
  Database,
  CircleDot,
  Radio,
  Unplug,
  Loader2,
  Filter,
} from 'lucide-react'
import type { DockerEvent, EventStreamStatus } from '@/types/app-bindings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PanelToolbar, PanelToolbarHeading, PanelToolbarSearch } from '@/components/ui/panel-toolbar'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { cn } from '@/lib/utils'
import { formatUnixSecondsTime } from '@/utils/datetime'

interface EventPanelProps {
  events: DockerEvent[]
  status: EventStreamStatus
  onClear: () => void
}

type TypeFilter = 'all' | 'container' | 'image' | 'network' | 'volume'

const TYPE_FILTERS: { key: TypeFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <Activity className="size-3.5" /> },
  { key: 'container', label: '容器', icon: <Box className="size-3.5" /> },
  { key: 'image', label: '镜像', icon: <Layers className="size-3.5" /> },
  { key: 'network', label: '网络', icon: <Share2 className="size-3.5" /> },
  { key: 'volume', label: '存储卷', icon: <Database className="size-3.5" /> },
]

function typeIcon(t: string) {
  switch (t) {
    case 'container':
      return <Box className="size-3.5" />
    case 'image':
      return <Layers className="size-3.5" />
    case 'network':
      return <Share2 className="size-3.5" />
    case 'volume':
      return <Database className="size-3.5" />
    default:
      return <CircleDot className="size-3.5" />
  }
}

function actionColor(action: string): string {
  if (['start', 'create', 'pull', 'connect', 'mount'].includes(action))
    return 'text-green-500 bg-green-500/10 border-green-500/30'
  if (['stop', 'die', 'kill', 'destroy', 'delete', 'remove', 'disconnect', 'unmount'].includes(action))
    return 'text-red-500 bg-red-500/10 border-red-500/30'
  if (['restart', 'pause', 'unpause', 'rename', 'update', 'tag', 'untag'].includes(action))
    return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30'
  return 'text-muted-foreground bg-muted border-border'
}

function statusIndicator(status: EventStreamStatus) {
  switch (status) {
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-green-500">
          <Radio className="size-3" />
          已连接
        </span>
      )
    case 'connecting':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          连接中
        </span>
      )
    case 'disconnected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-yellow-500">
          <Unplug className="size-3" />
          已断开，重连中…
        </span>
      )
    case 'stopped':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Unplug className="size-3" />
          已停止
        </span>
      )
  }
}

export default function EventPanel({ events, status, onClear }: EventPanelProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [showFilters, setShowFilters] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [events.length, autoScroll])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (typeFilter !== 'all' && ev.event_type !== typeFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          ev.event_type.toLowerCase().includes(q) ||
          ev.action.toLowerCase().includes(q) ||
          ev.actor_name.toLowerCase().includes(q) ||
          ev.actor_id.toLowerCase().includes(q) ||
          ev.actor_image.toLowerCase().includes(q) ||
          ev.detail.toLowerCase().includes(q) ||
          ev.scope.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [events, typeFilter, search])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: events.length }
    for (const ev of events) {
      counts[ev.event_type] = (counts[ev.event_type] || 0) + 1
    }
    return counts
  }, [events])

  const eventColumns = useMemo<DataTableColumn<DockerEvent>[]>(
    () => [
      {
        key: 'name',
        title: '名称',
        colWidth: '12rem',
        render: (_, ev) => (
          <span className="font-medium text-foreground" title={ev.actor_name || undefined}>
            {ev.actor_name || '—'}
          </span>
        ),
      },
      {
        key: 'id',
        title: 'ID',
        colWidth: '8rem',
        render: (_, ev) => <span title={ev.actor_id || undefined}>{ev.actor_id || '—'}</span>,
      },
      {
        key: 'time',
        title: '时间',
        colWidth: '8rem',
        render: (_, ev) => formatUnixSecondsTime(ev.time),
      },
      {
        key: 'type',
        title: '类型',
        colWidth: '8rem',
        render: (_, ev) => (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
            {typeIcon(ev.event_type)}
            <span className="min-w-0 truncate">{ev.event_type}</span>
          </span>
        ),
      },
      {
        key: 'action',
        title: '动作',
        colWidth: '8rem',
        render: (_, ev) => (
          <Badge variant="outline" size="pill" className={cn('max-w-full min-w-0', actionColor(ev.action))}>
            {ev.action}
          </Badge>
        ),
      },
      {
        key: 'image',
        title: '镜像',
        colWidth: '8rem',
        render: (_, ev) => <span title={ev.actor_image || undefined}>{ev.actor_image || '—'}</span>,
      },
      {
        key: 'detail',
        title: '详情',
        render: (_, ev) => <span title={ev.detail || undefined}>{ev.detail || '—'}</span>,
      },
    ],

    []
  )

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <PanelToolbar>
        <PanelToolbarHeading icon={<Activity />} title="事件" meta={events.length > 0 ? `(${events.length})` : null} />

        <PanelToolbarSearch
          ref={searchRef}
          value={search}
          onValueChange={setSearch}
          placeholder='搜索… ("/" 快速聚焦)'
        />

        <Button
          type="button"
          variant="ghostAccent"
          icon
          className={showFilters ? 'bg-muted text-foreground' : undefined}
          title="类型过滤"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {statusIndicator(status)}
          <Button
            type="button"
            variant="ghostDanger"
            icon
            title="清空事件"
            onClick={onClear}
            disabled={events.length === 0}
          >
            <Trash2 />
          </Button>
        </div>
      </PanelToolbar>

      {/* Filter chips */}
      {showFilters && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-5 py-3">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTypeFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                typeFilter === f.key
                  ? 'bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {f.icon}
              {f.label}
              <span className="text-[10px] opacity-60">{typeCounts[f.key] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Event list */}
      <div
        ref={listRef}
        className="flex-1 overflow-auto bg-card"
        onScroll={(e) => {
          const el = e.currentTarget
          setAutoScroll(el.scrollTop <= 10)
        }}
      >
        {filtered.length === 0 ? (
          <EmptyState icon={<Activity />} title={events.length === 0 ? '等待 Docker 事件…' : '无匹配的事件'} />
        ) : (
          <DataTable
            className="w-full table-fixed"
            rowKey={(ev, i) => `${ev.time_nano || ev.time}-${ev.actor_id}-${ev.action}-${i}`}
            columns={eventColumns}
            rows={filtered}
          />
        )}
      </div>
    </div>
  )
}
