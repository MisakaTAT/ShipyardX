import { useMemo, useState } from 'react'
import { Plus, ScanSearch, Share2, Trash2 } from 'lucide-react'
import type { Network } from '@/types/app-bindings'
import NetworkCreateDialog from '@/features/docker-networks/ui/network-create-dialog'
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
        key: 'name',
        title: '名称',
        render: (n) => (
          <>
            <div className="font-medium text-foreground">{n.name}</div>
            <div className="text-muted-foreground">{n.id.slice(0, 12)}</div>
          </>
        ),
      },
      { key: 'driver', title: 'Driver', render: (n) => n.driver || '—' },
      { key: 'scope', title: 'Scope', render: (n) => n.scope || '—' },
      { key: 'subnets', title: '子网', render: (n) => <ChipCell items={n.subnets} /> },
      { key: 'gateways', title: '网关', render: (n) => <ChipCell items={n.gateways} /> },
      {
        key: 'labels',
        title: '标签',
        width: '16rem',
        className: 'whitespace-normal',
        render: (n) => <ChipCell items={n.labels} />,
      },
      {
        key: 'attrs',
        title: '属性',
        render: (n) => (
          <>
            {n.internal ? 'internal' : ''}
            {n.internal && n.attachable ? ' · ' : ''}
            {n.attachable ? 'attachable' : '—'}
          </>
        ),
      },
      {
        key: 'created',
        title: '创建时间',
        render: (n) => <span title={n.created_at || undefined}>{formatDateTimeString(n.created_at)}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        width: '5rem',
        render: (n) => (
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
        ),
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
        rowKey={(n) => n.id}
        loading={isFetching && networks.length === 0}
        empty={{ icon: Share2, title: search ? `无匹配的网络 "${search}"` : '没有网络' }}
        tableClassName="text-sm"
      />

      <NetworkCreateDialog
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
        description={
          removeTarget ? `确认删除网络「${removeTarget.name}」？\n\n若仍有容器连接该网络，删除会失败。` : ''
        }
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
