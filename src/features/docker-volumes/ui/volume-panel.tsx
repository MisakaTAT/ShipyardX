import { useMemo, useState } from 'react'
import { ChevronDown, Database, Plus, ScanSearch, Trash2 } from 'lucide-react'
import type { Volume } from '@/types/app-bindings'
import VolumeCreateDialog from '@/features/docker-volumes/ui/volume-create-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { ConfirmDialog, DataTable, PanelHeader, PanelShell, type ColumnDef } from '@/shared/components'
import { usePruneUnusedVolumes, useVolumes, useRemoveVolume } from '@/features/docker-volumes/api/use-volumes'
import { navigateWorkspace, setNextContainerSearch } from '@/shared/lib/workspace-nav'

interface VolumePanelProps {
  serverId: string
}

export default function VolumePanel({ serverId }: VolumePanelProps) {
  const { data: volumes = [], isFetching, dataUpdatedAt } = useVolumes(serverId)
  const removeVolume = useRemoveVolume(serverId)
  const pruneUnusedVolumes = usePruneUnusedVolumes(serverId)

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Volume | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Volume | null>(null)
  const [cleanupOpen, setCleanupOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return volumes
    const q = search.toLowerCase()
    return volumes.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.stack.toLowerCase().includes(q) ||
        v.used_by.toLowerCase().includes(q) ||
        v.driver.toLowerCase().includes(q) ||
        v.scope.toLowerCase().includes(q) ||
        v.mountpoint.toLowerCase().includes(q)
    )
  }, [volumes, search])

  const columns: ColumnDef<Volume>[] = useMemo(
    () => [
      {
        id: 'name',
        header: '名称',
        meta: { width: '16rem' },
        cell: ({ row }) => (
          <span className="font-medium text-foreground" title={row.original.name}>
            {row.original.name}
          </span>
        ),
      },
      {
        id: 'driver',
        header: 'Driver',
        meta: { width: '6rem' },
        cell: ({ row }) => row.original.driver || '-',
      },
      {
        id: 'scope',
        header: 'Scope',
        meta: { width: '6rem' },
        cell: ({ row }) => row.original.scope || '-',
      },
      {
        id: 'stack',
        header: 'Stack',
        meta: { width: '10rem' },
        cell: ({ row }) => row.original.stack || '-',
      },
      {
        id: 'used_by',
        header: 'Used by',
        meta: { width: '10rem' },
        cell: ({ row }) => {
          const v = row.original
          if (!v.used_by) return <span>-</span>
          return (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setNextContainerSearch(serverId, v.name)
                navigateWorkspace({ tab: 'containers', serverId, containerSearch: v.name })
              }}
            >
              {v.used_by}
            </button>
          )
        },
      },
      {
        id: 'mountpoint',
        header: 'Mountpoint',
        cell: ({ row }) => <span title={row.original.mountpoint}>{row.original.mountpoint || '-'}</span>,
      },
      {
        id: 'created',
        header: '创建时间',
        meta: { width: '12rem' },
        cell: ({ row }) => <span title={row.original.created_at || undefined}>{row.original.created_ago}</span>,
      },
      {
        id: 'actions',
        header: '操作',
        meta: { width: '5rem' },
        cell: ({ row }) => {
          const v = row.original
          return (
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
          )
        },
      },
    ],
    [serverId]
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
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" />}>
              操作
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onClick={() => setShowCreate(true)}>
                <Plus className="size-3.5" />
                创建存储卷
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupOpen(true)}>
                <Trash2 className="size-3.5" />
                清理未使用存储卷
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <DataTable<Volume>
        columns={columns}
        data={filtered}
        getRowId={(v) => v.name}
        loading={isFetching && volumes.length === 0}
        empty={{ icon: Database, title: search ? `无匹配的存储卷 "${search}"` : '没有存储卷' }}
      />

      <VolumeCreateDialog serverId={serverId} open={showCreate} onOpenChange={setShowCreate} />

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

      <ConfirmDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        title="清理未使用存储卷"
        description="删除当前没有被任何容器使用的本地存储卷。被清理后，其中的数据将无法恢复。"
        destructive
        confirmText="清理未使用存储卷"
        onConfirm={() => {
          pruneUnusedVolumes.mutate()
        }}
      />
    </PanelShell>
  )
}
