import { useMemo, useState } from 'react'
import { Plus, ScanSearch, Share2, Trash2 } from 'lucide-react'
import type { Network } from '@/types/app-bindings'
import NetworkCreateDialog from '@/features/docker-networks/ui/network-create-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { formatDateTimeString } from '@/shared/lib/datetime'
import { ConfirmDialog, DataTable, PanelHeader, PanelShell, type ColumnDef } from '@/shared/components'
import { ChipCell } from '@/features/docker-networks/ui/chip-cell'
import { useNetworks, useRemoveNetwork } from '@/features/docker-networks/api/use-networks'

interface NetworkPanelProps {
  serverId: string
}

export default function NetworkPanel({ serverId }: NetworkPanelProps) {
  const { data: networks = [], isFetching, dataUpdatedAt } = useNetworks(serverId)
  const removeNetwork = useRemoveNetwork(serverId)

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Network | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Network | null>(null)

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
        header: '名称',
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
      { id: 'driver', header: 'Driver', cell: ({ row }) => row.original.driver || '—' },
      { id: 'scope', header: 'Scope', cell: ({ row }) => row.original.scope || '—' },
      { id: 'subnets', header: '子网', cell: ({ row }) => <ChipCell items={row.original.subnets} /> },
      { id: 'gateways', header: '网关', cell: ({ row }) => <ChipCell items={row.original.gateways} /> },
      {
        id: 'labels',
        header: '标签',
        meta: { width: '16rem', className: 'whitespace-normal' },
        cell: ({ row }) => <ChipCell items={row.original.labels} />,
      },
      {
        id: 'attrs',
        header: '属性',
        cell: ({ row }) => {
          const n = row.original
          return (
            <>
              {n.internal ? 'internal' : ''}
              {n.internal && n.attachable ? ' · ' : ''}
              {n.attachable ? 'attachable' : '—'}
            </>
          )
        },
      },
      {
        id: 'created',
        header: '创建时间',
        meta: { width: '12rem' },
        cell: ({ row }) => (
          <span title={row.original.created_at || undefined}>{formatDateTimeString(row.original.created_at)}</span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
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
                title="删除"
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
    []
  )

  return (
    <PanelShell>
      <PanelHeader
        icon={Share2}
        title="网络"
        stats={networks.length > 0 ? `(${networks.length})` : undefined}
        search={{ value: search, onChange: setSearch }}
        lastUpdated={dataUpdatedAt}
        actions={
          <Button type="button" onClick={() => setShowCreate(true)}>
            <Plus />
            创建网络
          </Button>
        }
      />

      <DataTable<Network>
        columns={columns}
        data={filtered}
        getRowId={(n) => n.id}
        loading={isFetching && networks.length === 0}
        empty={{ icon: Share2, title: search ? `无匹配的网络 "${search}"` : '没有网络' }}
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
        title="删除网络"
        description={removeTarget ? `确认删除网络「${removeTarget.name}」？\n\n若仍有容器连接该网络，删除会失败。` : ''}
        destructive
        confirmText="删除"
        onConfirm={() => {
          if (!removeTarget) return
          removeNetwork.mutate(removeTarget.id)
        }}
      />
    </PanelShell>
  )
}
