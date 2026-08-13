import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        header: t('ui.common.name'),
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
        header: t('ui.common.created'),
        meta: { width: '12rem' },
        cell: ({ row }) => <span title={row.original.created_at || undefined}>{row.original.created_ago}</span>,
      },
      {
        id: 'actions',
        header: t('ui.common.actions'),
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
                title={t('ui.common.delete')}
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
    [t, serverId]
  )

  return (
    <PanelShell>
      <PanelHeader
        icon={Database}
        title={t('ui.volumes.title')}
        stats={volumes.length > 0 ? `(${volumes.length})` : undefined}
        search={{ value: search, onChange: setSearch }}
        lastUpdated={dataUpdatedAt}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" />}>
              {t('ui.common.actions')}
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              <DropdownMenuItem onClick={() => setShowCreate(true)}>
                <Plus className="size-3.5" />
                {t('ui.volumes.createTitle')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupOpen(true)}>
                <Trash2 className="size-3.5" />
                {t('ui.volumes.pruneTitle')}
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
        empty={{ icon: Database, title: search ? t('ui.volumes.noMatch', { query: search }) : t('ui.volumes.empty') }}
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
        title={t('ui.volumes.deleteTitle')}
        description={removeTarget ? t('ui.volumes.deleteDesc', { name: removeTarget.name }) : ''}
        destructive
        confirmText={t('ui.common.delete')}
        onConfirm={() => {
          if (!removeTarget) return
          removeVolume.mutate(removeTarget.name)
        }}
      />

      <ConfirmDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        title={t('ui.volumes.pruneTitle')}
        description={t('ui.volumes.pruneDesc')}
        destructive
        confirmText={t('ui.volumes.pruneTitle')}
        onConfirm={() => {
          pruneUnusedVolumes.mutate()
        }}
      />
    </PanelShell>
  )
}
