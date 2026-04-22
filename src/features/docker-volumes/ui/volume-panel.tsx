import { useMemo, useState } from 'react'
import { Database, Plus, ScanSearch, Trash2 } from 'lucide-react'
import type { Volume } from '@/types/app-bindings'
import VolumeCreateDialog from '@/features/docker-volumes/ui/volume-create-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { formatDateTimeString } from '@/shared/lib/datetime'
import {
  ConfirmDialog,
  DataTable,
  PanelHeader,
  PanelShell,
  type ColumnDef,
} from '@/shared/components'
import { useVolumes, useRemoveVolume } from '@/features/docker-volumes/api/use-volumes'

interface VolumePanelProps {
  serverId: string
}

export default function VolumePanel({ serverId }: VolumePanelProps) {
  const { data: volumes = [], isFetching, dataUpdatedAt } = useVolumes(serverId)
  const removeVolume = useRemoveVolume(serverId)

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Volume | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Volume | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return volumes
    const q = search.toLowerCase()
    return volumes.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.driver.toLowerCase().includes(q) ||
        v.scope.toLowerCase().includes(q) ||
        v.mountpoint.toLowerCase().includes(q)
    )
  }, [volumes, search])

  const columns: ColumnDef<Volume>[] = useMemo(
    () => [
      {
        key: 'name',
        title: '名称',
        width: '16rem',
        render: (v) => (
          <span className="font-medium text-foreground" title={v.name}>
            {v.name}
          </span>
        ),
      },
      { key: 'driver', title: 'Driver', width: '6rem', render: (v) => v.driver || '—' },
      { key: 'scope', title: 'Scope', width: '6rem', render: (v) => v.scope || '—' },
      {
        key: 'created',
        title: '创建时间',
        width: '10rem',
        render: (v) => <span title={v.created_at || undefined}>{formatDateTimeString(v.created_at)}</span>,
      },
      {
        key: 'mountpoint',
        title: 'Mountpoint',
        render: (v) => <span title={v.mountpoint}>{v.mountpoint || '—'}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        width: '5rem',
        render: (v) => (
          <div>
            <Button type="button" variant="ghost" size="icon-sm" title="Inspect" onClick={() => setInspectTarget(v)}>
              <ScanSearch />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="删除"
              onClick={() => setRemoveTarget(v)}
              className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
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
    <PanelShell>
      <PanelHeader
        icon={Database}
        title="存储卷"
        stats={volumes.length > 0 ? `(${volumes.length})` : undefined}
        search={{ value: search, onChange: setSearch }}
        lastUpdated={dataUpdatedAt}
        actions={
          <Button type="button" onClick={() => setShowCreate(true)}>
            <Plus />
            创建存储卷
          </Button>
        }
      />

      <DataTable<Volume>
        columns={columns}
        data={filtered}
        rowKey={(v) => v.name}
        loading={isFetching && volumes.length === 0}
        empty={{ icon: Database, title: search ? `无匹配的存储卷 "${search}"` : '没有存储卷' }}
      />

      <VolumeCreateDialog
        serverId={serverId}
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => {
          /* 事件流 invalidate */
        }}
      />

      {inspectTarget ? (
        <ResourceInspectDialog
          serverId={serverId}
          kind="volume"
          targetId={inspectTarget.name}
          targetLabel={inspectTarget.name}
          onClose={() => setInspectTarget(null)}
        />
      ) : null}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="删除存储卷"
        description={
          removeTarget ? `确认删除存储卷「${removeTarget.name}」？\n\n若仍有容器正在使用该卷，删除会失败。` : ''
        }
        destructive
        confirmText="删除"
        onConfirm={() => {
          if (!removeTarget) return
          removeVolume.mutate(removeTarget.name)
        }}
      />
    </PanelShell>
  )
}
