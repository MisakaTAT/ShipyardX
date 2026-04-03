import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Activity,
  Search,
  X,
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableBodyRow,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  eventTableHead,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatUnixSecondsTime } from '@/utils/datetime'

interface EventPanelProps {
  events: DockerEvent[]
  status: EventStreamStatus
  onClear: () => void
}

type TypeFilter = 'all' | 'container' | 'image' | 'network' | 'volume'

const TYPE_FILTERS: { key: TypeFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <Activity className="size-3" /> },
  { key: 'container', label: '容器', icon: <Box className="size-3" /> },
  { key: 'image', label: '镜像', icon: <Layers className="size-3" /> },
  { key: 'network', label: '网络', icon: <Share2 className="size-3" /> },
  { key: 'volume', label: '存储卷', icon: <Database className="size-3" /> },
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
  return 'text-(--text-soft) bg-(--bg-surface) border-(--border-sub)'
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
        <span className="inline-flex items-center gap-1.5 text-xs text-(--text-muted)">
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
        <span className="inline-flex items-center gap-1.5 text-xs text-(--text-muted)">
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

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-app)' }}>
      {/* Toolbar */}
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3"
        style={{ background: 'var(--bg-panel)' }}
      >
        <Activity className="w-4 h-4 shrink-0" style={{ color: 'var(--text-soft)' }} />
        <span className="text-sm font-medium mr-1" style={{ color: 'var(--text-base)' }}>
          事件
        </span>
        {events.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ({events.length})
          </span>
        )}

        <div className="relative ml-2">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索… ("/" 快速聚焦)'
            className="h-8 w-52 border-(--border-sub) bg-(--bg-input) pr-8 pl-8 text-xs text-(--text-base)"
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-(--text-muted)"
              onClick={() => setSearch('')}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="类型过滤"
          className={cn('rounded-lg text-(--text-muted)', showFilters && 'bg-(--bg-surface) text-(--text-base)')}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="size-3.5" />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {statusIndicator(status)}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="清空事件"
            className="rounded-lg text-(--text-muted) hover:bg-red-500/10 hover:text-red-500"
            onClick={onClear}
            disabled={events.length === 0}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      {showFilters && (
        <div
          className="flex shrink-0 items-center gap-1 border-b border-border px-5 py-3"
          style={{ background: 'var(--bg-panel)' }}
        >
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTypeFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                typeFilter === f.key
                  ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-(--accent-text)'
                  : 'text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)',
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
        className="flex-1 overflow-auto bg-(--bg-panel)"
        onScroll={(e) => {
          const el = e.currentTarget
          setAutoScroll(el.scrollTop <= 10)
        }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
            <Activity className="w-10 h-10 mb-3" style={{ color: 'var(--border-sub)' }} />
            <p className="text-sm">{events.length === 0 ? '等待 Docker 事件…' : '无匹配的事件'}</p>
          </div>
        ) : (
          <Table className="w-full text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className={eventTableHead.first}>ID</TableHead>
                <TableHead className={eventTableHead.mid}>时间</TableHead>
                <TableHead className={eventTableHead.mid}>类型</TableHead>
                <TableHead className={eventTableHead.mid}>动作</TableHead>
                <TableHead className={eventTableHead.wide}>名称</TableHead>
                <TableHead className={eventTableHead.wide}>镜像</TableHead>
                <TableHead className={eventTableHead.last}>详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((ev, i) => {
                return (
                  <TableBodyRow key={`${ev.time_nano || ev.time}-${ev.actor_id}-${ev.action}-${i}`}>
                    <TableCell
                      className="pl-5 pr-3 py-2 align-middle font-mono"
                      style={{ color: 'var(--text-muted)' }}
                      title={ev.actor_id || undefined}
                    >
                      {ev.actor_id || '—'}
                    </TableCell>
                    <TableCell
                      className="px-3 py-2 font-mono tabular-nums align-middle whitespace-nowrap"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {formatUnixSecondsTime(ev.time)}
                    </TableCell>
                    <TableCell className="px-3 py-2 align-middle">
                      <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-soft)' }}>
                        {typeIcon(ev.event_type)}
                        <span className="text-[11px]">{ev.event_type}</span>
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 align-middle">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap',
                          actionColor(ev.action),
                        )}
                      >
                        {ev.action}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 align-middle max-w-[160px]">
                      <span
                        className="block truncate font-medium"
                        style={{ color: ev.actor_name ? 'var(--text-base)' : 'var(--text-muted)' }}
                        title={ev.actor_name || undefined}
                      >
                        {ev.actor_name || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 align-middle max-w-0">
                      <span
                        className="block truncate font-mono"
                        style={{ color: ev.actor_image ? 'var(--text-soft)' : 'var(--text-muted)' }}
                        title={ev.actor_image || undefined}
                      >
                        {ev.actor_image || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 pr-5 py-2 align-middle max-w-0">
                      <span
                        className="block truncate font-mono"
                        style={{ color: ev.detail ? 'var(--text-soft)' : 'var(--text-muted)' }}
                        title={ev.detail || undefined}
                      >
                        {ev.detail || '—'}
                      </span>
                    </TableCell>
                  </TableBodyRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
