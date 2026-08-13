import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Plus, ScanSearch, Share2, Trash2 } from 'lucide-react'
import type { Network } from '@/types/app-bindings'
import NetworkCreateDialog from '@/features/docker-networks/ui/network-create-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { ConfirmDialog, DataTable, PanelHeader, PanelShell, type ColumnDef } from '@/shared/components'
import { TruncatedChips } from '@/shared/components/truncated-chips'
import { useNetworks, usePruneUnusedNetworks, useRemoveNetwork } from '@/features/docker-networks/api/use-networks'

interface NetworkPanelProps {
  serverId: string
}

export default function NetworkPanel({ serverId }: NetworkPanelProps) {
  const { t } = useTranslation()
  const { data: networks = [], isFetching, dataUpdatedAt } = useNetworks(serverId)
  const removeNetwork = useRemoveNetwork(serverId)
  const pruneUnusedNetworks = usePruneUnusedNetworks(serverId)

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Network | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Network | null>(null)
  const [cleanupOpen, setCleanupOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return networks
    const q = search.toLowerCase()
    return networks.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        n.driver.toLowerCase().includes(q) ||
        n.scope.toLowerCase().includes(q) ||
        n.created_at.toLowerCase().includes(q) ||
        n.subnets.join(' ').toLowerCase().includes(q) ||
        n.gateways.join(' ').toLowerCase().includes(q) ||
        n.labels.join(' ').toLowerCase().includes(q)
    )
  }, [networks, search])

  const columns: ColumnDef<Network>[] = useMemo(
    () => [
      {
        id: 'name',
        header: t('ui.common.name'),
        cell: ({ row }) => {
          const n = row.original
          return (
            <>
              <div className="font-medium text-foreground">{n.name}</div>
              <div>{n.id.slice(0, 12)}</div>
            </>
          )
        },
      },
      { id: 'driver', header: 'Driver', cell: ({ row }) => row.original.driver || '-' },
      { id: 'scope', header: 'Scope', cell: ({ row }) => row.original.scope || '-' },
      {
        id: 'subnets',
        header: t('ui.networks.colSubnets'),
        cell: ({ row }) => <TruncatedChips items={row.original.subnets} />,
      },
      {
        id: 'gateways',
        header: t('ui.networks.colGateways'),
        cell: ({ row }) => <TruncatedChips items={row.original.gateways} />,
      },
      {
        id: 'labels',
        header: t('ui.common.labels'),
        meta: { width: '16rem', className: 'whitespace-normal' },
        cell: ({ row }) => <TruncatedChips items={row.original.labels} />,
      },
      {
        id: 'attrs',
        header: t('ui.networks.colAttrs'),
        cell: ({ row }) => {
          const n = row.original
          return (
            <>
              {n.internal ? 'internal' : ''}
              {n.internal && n.attachable ? ' · ' : ''}
              {n.attachable ? 'attachable' : '-'}
            </>
          )
        },
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
          const n = row.original
          return (
            <div>
              <Button type="button" variant="ghost" size="icon-sm" title="Inspect" onClick={() => setInspectTarget(n)}>
                <ScanSearch />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t('ui.common.delete')}
                onClick={() => setRemoveTarget(n)}
                className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 />
              </Button>
            </div>
          )
        },
      },
    ],
    [t]
  )

  return (
    <PanelShell>
      <PanelHeader
        icon={Share2}
        title={t('ui.networks.title')}
        stats={networks.length > 0 ? `(${networks.length})` : undefined}
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
                {t('ui.networks.createTitle')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupOpen(true)}>
                <Trash2 className="size-3.5" />
                {t('ui.networks.pruneTitle')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <DataTable<Network>
        columns={columns}
        data={filtered}
        getRowId={(n) => n.id}
        loading={isFetching && networks.length === 0}
        empty={{ icon: Share2, title: search ? t('ui.networks.noMatch', { query: search }) : t('ui.networks.empty') }}
        tableClassName="text-sm"
      />

      <NetworkCreateDialog serverId={serverId} open={showCreate} onOpenChange={setShowCreate} />

      {inspectTarget ? (
        <ResourceInspectDialog
          serverId={serverId}
          kind="network"
          targetId={inspectTarget.id}
          targetLabel={inspectTarget.name}
          onClose={() => setInspectTarget(null)}
        />
      ) : null}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title={t('ui.networks.deleteTitle')}
        description={removeTarget ? t('ui.networks.deleteDesc', { name: removeTarget.name }) : ''}
        destructive
        confirmText={t('ui.common.delete')}
        onConfirm={() => {
          if (!removeTarget) return
          removeNetwork.mutate(removeTarget.id)
        }}
      />

      <ConfirmDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        title={t('ui.networks.pruneTitle')}
        description={t('ui.networks.pruneDesc')}
        destructive
        confirmText={t('ui.networks.pruneTitle')}
        onConfirm={() => {
          pruneUnusedNetworks.mutate()
        }}
      />
    </PanelShell>
  )
}
