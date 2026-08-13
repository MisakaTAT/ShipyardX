import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, Box, CircleDot, Database, Filter, Layers, Search, Share2, Trash2 } from 'lucide-react'
import type { DockerEvent, EventStreamStatus } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { DataTable, PanelHeader, PanelShell, ToneBadge, type ColumnDef } from '@/shared/components'
import type { BadgeTone } from '@/shared/styles/variants'

interface EventPanelProps {
  events: DockerEvent[]
  status: EventStreamStatus
  onClear: () => void
}

type TypeFilter = 'all' | 'container' | 'image' | 'network' | 'volume'

type TypeFilterLabelKey = `ui.events.filter${'All' | 'Container' | 'Image' | 'Network' | 'Volume'}`

const TYPE_FILTERS: { key: TypeFilter; labelKey: TypeFilterLabelKey; icon: React.ReactNode }[] = [
  { key: 'all', labelKey: 'ui.events.filterAll', icon: <Activity className="size-3.5" /> },
  { key: 'container', labelKey: 'ui.events.filterContainer', icon: <Box className="size-3.5" /> },
  { key: 'image', labelKey: 'ui.events.filterImage', icon: <Layers className="size-3.5" /> },
  { key: 'network', labelKey: 'ui.events.filterNetwork', icon: <Share2 className="size-3.5" /> },
  { key: 'volume', labelKey: 'ui.events.filterVolume', icon: <Database className="size-3.5" /> },
]

function typeIcon(icon: string) {
  switch (icon) {
    case 'container':
      return <Box className="size-3.5" />
    case 'box':
      return <Box className="size-3.5" />
    case 'image':
      return <Layers className="size-3.5" />
    case 'layers':
      return <Layers className="size-3.5" />
    case 'network':
      return <Share2 className="size-3.5" />
    case 'share-2':
      return <Share2 className="size-3.5" />
    case 'volume':
      return <Database className="size-3.5" />
    case 'database':
      return <Database className="size-3.5" />
    default:
      return <CircleDot className="size-3.5" />
  }
}

function StatusIndicator({ status }: { status: EventStreamStatus }) {
  const { t } = useTranslation()
  switch (status) {
    case 'connected':
      return (
        <ToneBadge tone="success" dot pulse>
          {t('ui.events.connected')}
        </ToneBadge>
      )
    case 'connecting':
      return (
        <ToneBadge tone="info" dot pulse>
          {t('ui.events.connecting')}
        </ToneBadge>
      )
    case 'disconnected':
      return (
        <ToneBadge tone="warning" dot pulse>
          {t('ui.events.reconnecting')}
        </ToneBadge>
      )
    case 'stopped':
      return (
        <ToneBadge tone="muted" dot>
          {t('ui.events.stopped')}
        </ToneBadge>
      )
  }
}

export default function EventPanel({ events, status, onClear }: EventPanelProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [showFilters, setShowFilters] = useState(false)

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
        header: t('ui.common.name'),
        meta: { width: '12rem' },
        cell: ({ row }) => (
          <span className="font-medium text-foreground" title={row.original.actor_name || undefined}>
            {row.original.actor_name || '-'}
          </span>
        ),
      },
      {
        id: 'id',
        header: 'ID',
        meta: { width: '8rem' },
        cell: ({ row }) => <span title={row.original.actor_id || undefined}>{row.original.actor_id || '-'}</span>,
      },
      {
        id: 'time',
        header: t('ui.events.colTime'),
        meta: { width: '8rem' },
        cell: ({ row }) => row.original.time || '-',
      },
      {
        id: 'type',
        header: t('ui.events.colType'),
        meta: { width: '8rem' },
        cell: ({ row }) => (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
            {typeIcon(row.original.event_type_icon)}
            <span className="min-w-0 truncate">{row.original.event_type_label || row.original.event_type}</span>
          </span>
        ),
      },
      {
        id: 'action',
        header: t('ui.events.colAction'),
        meta: { width: '8rem' },
        cell: ({ row }) => <ToneBadge tone={row.original.action_tone as BadgeTone}>{row.original.action}</ToneBadge>,
      },
      {
        id: 'image',
        header: t('ui.events.colImage'),
        meta: { width: '8rem' },
        cell: ({ row }) => <span title={row.original.actor_image || undefined}>{row.original.actor_image || '-'}</span>,
      },
      {
        id: 'detail',
        header: t('ui.events.colDetail'),
        cell: ({ row }) => <span title={row.original.detail || undefined}>{row.original.detail || '-'}</span>,
      },
    ],
    [t]
  )

  return (
    <PanelShell>
      <PanelHeader
        icon={Activity}
        title={t('ui.events.title')}
        stats={events.length > 0 ? `(${events.length})` : undefined}
        search={{ value: search, onChange: setSearch }}
        actions={
          <>
            <StatusIndicator status={status} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={showFilters ? 'bg-muted text-foreground' : undefined}
              title={t('ui.events.typeFilter')}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              title={t('ui.events.clear')}
              onClick={onClear}
              disabled={events.length === 0}
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      {showFilters && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-3 py-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTypeFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                typeFilter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {f.icon}
              {t(f.labelKey)}
              <span className="text-[10px] opacity-60">{typeCounts[f.key] || 0}</span>
            </button>
          ))}
        </div>
      )}

      <DataTable<DockerEvent>
        columns={eventColumns}
        data={filtered}
        getRowId={(ev, i) => ev.event_id || `${ev.time}-${ev.actor_id}-${ev.action}-${i}`}
        empty={{
          icon: events.length === 0 ? Activity : Search,
          title: events.length === 0 ? t('ui.events.waiting') : t('ui.events.noMatch'),
        }}
      />
    </PanelShell>
  )
}
