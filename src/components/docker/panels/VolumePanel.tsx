import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { Database, Trash2, Plus, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { Volume } from '@/types/app-bindings'
import VolumeCreateDialog from '@/components/docker/dialogs/VolumeCreateDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import InspectDialog from '@/components/docker/dialogs/InspectDialog'
import { Button } from '@/components/ui/button'
import { EmptyState, PanelListLoading } from '@/components/ui/empty-state'
import { PanelToolbar, PanelToolbarHeading, PanelToolbarSearch } from '@/components/ui/panel-toolbar'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { formatDateTimeString, formatNowTime } from '@/utils/datetime'

interface Props {
  serverId: string
  refreshTick?: number
}

export default function VolumePanel({ serverId, refreshTick }: Props) {
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Volume | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Volume | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchVolumes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await commands.listVolumes(serverId)
      setVolumes(data)
      setLastUpdated(formatNowTime())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchVolumes()
  }, [fetchVolumes, refreshTick])

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

  const filtered = volumes.filter((v) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      v.name.toLowerCase().includes(q) ||
      v.driver.toLowerCase().includes(q) ||
      v.scope.toLowerCase().includes(q) ||
      v.mountpoint.toLowerCase().includes(q)
    )
  })

  const volumeColumns = useMemo<DataTableColumn<Volume>[]>(
    () => [
      {
        key: 'name',
        title: '名称',
        colWidth: '16rem',
        render: (_, v) => (
          <span className="font-medium text-foreground" title={v.name}>
            {v.name}
          </span>
        ),
      },
      {
        key: 'driver',
        title: 'Driver',
        colWidth: '6rem',
        render: (_, v) => v.driver || '—',
      },
      {
        key: 'scope',
        title: 'Scope',
        colWidth: '6rem',
        render: (_, v) => v.scope || '—',
      },
      {
        key: 'created',
        title: '创建时间',
        colWidth: '10rem',
        render: (_, v) => <span title={v.created_at || undefined}>{formatDateTimeString(v.created_at)}</span>,
      },
      {
        key: 'mountpoint',
        title: 'Mountpoint',
        render: (_, v) => <span title={v.mountpoint}>{v.mountpoint || '—'}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        colWidth: '5rem',
        render: (_, v) => (
          <div>
            <Button
              type="button"
              variant="ghost"
              icon
              title="Inspect"
              onClick={() => setInspectTarget(v)}
              className="rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ScanSearch />
            </Button>
            <Button
              type="button"
              variant="ghost"
              icon
              title="删除"
              onClick={() => setRemoveTarget(v)}
              className="rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    []
  )

  return (
    <div className="flex h-full flex-col bg-background">
      <PanelToolbar>
        <PanelToolbarHeading
          icon={<Database />}
          title="存储卷"
          meta={volumes.length > 0 ? `(${volumes.length})` : null}
        />

        <PanelToolbarSearch
          ref={searchRef}
          value={search}
          onValueChange={setSearch}
          placeholder='搜索… ("/" 快速聚焦)'
        />

        <div className="ml-auto flex items-center gap-2">
          {lastUpdated ? <span className="mr-1 text-xs text-muted-foreground">更新于 {lastUpdated}</span> : null}
          <Button type="button" onClick={() => setShowCreate(true)}>
            <Plus />
            创建存储卷
          </Button>
        </div>
      </PanelToolbar>

      <div className="flex-1 overflow-auto bg-card">
        {loading && volumes.length === 0 ? (
          <PanelListLoading />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Database />} title={search ? `无匹配的存储卷 \"${search}\"` : '没有存储卷'} />
        ) : (
          <DataTable className="w-full table-fixed" rowKey="name" columns={volumeColumns} rows={filtered} />
        )}
      </div>

      <VolumeCreateDialog
        serverId={serverId}
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => void fetchVolumes()}
      />

      {inspectTarget && (
        <InspectDialog
          serverId={serverId}
          kind="volume"
          targetId={inspectTarget.name}
          targetLabel={inspectTarget.name}
          onClose={() => setInspectTarget(null)}
        />
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="删除存储卷"
        description={
          removeTarget ? `确认删除存储卷「${removeTarget.name}」？\n\n若仍有容器正在使用该卷，删除会失败。` : ''
        }
        confirmText="删除"
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await commands.removeVolume(serverId, removeTarget.name)
            await fetchVolumes()
          } catch (e) {
            toast.error(String(e))
          }
        }}
      />
    </div>
  )
}
