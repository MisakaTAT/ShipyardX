import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Box,
  CircleDot,
  Database,
  Filter,
  Layers,
  Loader2,
  Radio,
  Search,
  Share2,
  Trash2,
  Unplug,
} from 'lucide-react'
import type { DockerEvent, EventStreamStatus } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { formatUnixSecondsTime } from '@/shared/lib/datetime'
import { DataTable, SearchInput, ToneBadge, type ColumnDef } from '@/shared/components'
import type { BadgeTone } from '@/shared/styles/variants'

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

function actionTone(action: string): BadgeTone {
  if (['start', 'create', 'pull', 'connect', 'mount'].includes(action)) return 'success'
  if (['stop', 'die', 'kill', 'destroy', 'delete', 'remove', 'disconnect', 'unmount'].includes(action)) return 'danger'
  if (['restart', 'pause', 'unpause', 'rename', 'update', 'tag', 'untag'].includes(action)) return 'warning'
  return 'muted'
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
  const listRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [events.length, autoScroll])

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

  const eventColumns = useMemo<ColumnDef<DockerEvent>[]>(
    () => [
      {
        id: 'name',
        header: '名称',
        meta: { width: '12rem' },
        cell: ({ row }) => (
          <span className="font-medium text-foreground" title={row.original.actor_name || undefined}>
            {row.original.actor_name || '—'}
          </span>
        ),
      },
      {
        id: 'id',
        header: 'ID',
        meta: { width: '8rem' },
        cell: ({ row }) => (
          <span title={row.original.actor_id || undefined}>{row.original.actor_id || '—'}</span>
        ),
      },
      {
        id: 'time',
        header: '时间',
        meta: { width: '8rem' },
        cell: ({ row }) => formatUnixSecondsTime(row.original.time),
      },
      {
        id: 'type',
        header: '类型',
        meta: { width: '8rem' },
        cell: ({ row }) => (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
            {typeIcon(row.original.event_type)}
            <span className="min-w-0 truncate">{row.original.event_type}</span>
          </span>
        ),
      },
      {
        id: 'action',
        header: '动作',
        meta: { width: '8rem' },
        cell: ({ row }) => (
          <ToneBadge tone={actionTone(row.original.action)}>{row.original.action}</ToneBadge>
        ),
      },
      {
        id: 'image',
        header: '镜像',
        meta: { width: '8rem' },
        cell: ({ row }) => (
          <span title={row.original.actor_image || undefined}>{row.original.actor_image || '—'}</span>
        ),
      },
      {
        id: 'detail',
        header: '详情',
        cell: ({ row }) => (
          <span title={row.original.detail || undefined}>{row.original.detail || '—'}</span>
        ),
      },
    ],
    []
  )

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-4">
        <div className="inline-flex items-center gap-2.5">
          <div className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground [&_svg]:size-4">
            <Activity />
          </div>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span>事件</span>
            {events.length > 0 ? <span className="font-normal text-muted-foreground">({events.length})</span> : null}
          </div>
        </div>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder='搜索… ("/" 快速聚焦)'
          className="ml-4 w-full max-w-xs"
          clearable={false}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
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
            variant="destructive"
            size="icon-sm"
            title="清空事件"
            onClick={onClear}
            disabled={events.length === 0}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

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
                  ? 'bg-sidebar-nav-active-bg text-primary'
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

      <div
        ref={listRef}
        className="flex-1 overflow-auto bg-card"
        onScroll={(e) => {
          const el = e.currentTarget
          setAutoScroll(el.scrollTop <= 10)
        }}
      >
        <DataTable<DockerEvent>
          columns={eventColumns}
          data={filtered}
          getRowId={(ev, i) => `${ev.time_nano || ev.time}-${ev.actor_id}-${ev.action}-${i}`}
          empty={{
            icon: events.length === 0 ? Activity : Search,
            title: events.length === 0 ? '等待 Docker 事件…' : '无匹配的事件',
          }}
        />
      </div>
    </div>
  )
}
