import { useMemo, useState } from 'react'
import { Box, Plus } from 'lucide-react'
import type { Container } from '@/types/app-bindings'
import LogDialog from '@/features/docker-containers/ui/log-dialog'
import StatsDialog from '@/features/docker-containers/ui/stats-dialog'
import ContainerExecDialog from '@/features/docker-containers/ui/container-exec-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { formatUnixSeconds } from '@/shared/lib/datetime'
import {
  ConfirmDialog,
  DataTable,
  PanelHeader,
  PanelShell,
  type ColumnDef,
} from '@/shared/components'
import { ContainerStateBadge } from '@/features/docker-containers/ui/container-state-badge'
import { PortCell } from '@/features/docker-containers/ui/port-cell'
import { ContainerActionsMenu } from '@/features/docker-containers/ui/container-actions-menu'
import RunContainerDialog from '@/features/docker-containers/ui/run-container/run-container-dialog'
import {
  useContainerAction,
  useContainers,
  type ContainerAction,
} from '@/features/docker-containers/api/use-containers'

interface ContainerPanelProps {
  serverId: string
}

export default function ContainerPanel({ serverId }: ContainerPanelProps) {
  const { data: containers = [], isFetching, dataUpdatedAt } = useContainers(serverId)
  const action = useContainerAction(serverId)

  const [search, setSearch] = useState('')
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [logTarget, setLogTarget] = useState<Container | null>(null)
  const [statsTarget, setStatsTarget] = useState<Container | null>(null)
  const [execTarget, setExecTarget] = useState<Container | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Container | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Container | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return containers
    const q = search.toLowerCase()
    return containers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q)
    )
  }, [containers, search])

  const runningCount = containers.filter((c) => c.state === 'running').length

  const runAction = (containerId: string, kind: ContainerAction, force?: boolean) => {
    action.mutate({ containerId, action: kind, force })
  }

  const columns: ColumnDef<Container>[] = useMemo(
    () => [
      {
        key: 'name',
        title: '名称',
        render: (c) => (
          <>
            <div className="font-medium text-foreground">{c.name}</div>
            <div className="text-muted-foreground">{c.id}</div>
          </>
        ),
      },
      { key: 'image', title: '镜像', render: (c) => <span title={c.image}>{c.image}</span> },
      {
        key: 'state',
        title: '状态',
        width: '12rem',
        render: (c) => (
          <>
            <ContainerStateBadge state={c.state} />
            <br />
            <span title={c.status}>{c.status}</span>
          </>
        ),
      },
      { key: 'ip', title: 'IP', render: (c) => <span>{c.ip || '-'}</span> },
      { key: 'ports', title: '端口', render: (c) => (c.ports ? <PortCell ports={c.ports} /> : <span>—</span>) },
      {
        key: 'created',
        title: '创建时间',
        render: (c) => <span title={formatUnixSeconds(c.created_ts)}>{formatUnixSeconds(c.created_ts)}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        width: '3rem',
        render: (c) => (
          <ContainerActionsMenu
            container={c}
            busy={action.isPending}
            onAction={(a) => runAction(c.id, a)}
            onRemove={() => setRemoveTarget(c)}
            onExec={() => setExecTarget(c)}
            onStats={() => setStatsTarget(c)}
            onLog={() => setLogTarget(c)}
            onInspect={() => setInspectTarget(c)}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action.isPending]
  )

  const removeDescription = removeTarget
    ? removeTarget.state === 'running'
      ? `容器「${removeTarget.name}」正在运行，将使用强制移除。`
      : `确定要删除容器「${removeTarget.name}」吗？`
    : ''
  const removeConfirmText = removeTarget?.state === 'running' ? '强制删除' : '删除'

  return (
    <PanelShell>
      <PanelHeader
        icon={Box}
        title="容器"
        stats={containers.length > 0 ? `${runningCount}/${containers.length} 运行中` : undefined}
        search={{ value: search, onChange: setSearch }}
        lastUpdated={dataUpdatedAt}
        actions={
          <Button type="button" className="gap-1" onClick={() => setRunDialogOpen(true)}>
            <Plus />
            启动新容器
          </Button>
        }
      />

      <DataTable<Container>
        columns={columns}
        data={filtered}
        rowKey={(c) => c.id}
        loading={isFetching && containers.length === 0}
        empty={{ icon: Box, title: search ? `无匹配的容器 "${search}"` : '没有容器' }}
      />

      {logTarget ? (
        <LogDialog
          serverId={serverId}
          containerId={logTarget.id}
          containerName={logTarget.name}
          onClose={() => setLogTarget(null)}
        />
      ) : null}

      {statsTarget ? (
        <StatsDialog
          serverId={serverId}
          containerId={statsTarget.id}
          containerName={statsTarget.name}
          onClose={() => setStatsTarget(null)}
        />
      ) : null}

      {inspectTarget ? (
        <ResourceInspectDialog
          serverId={serverId}
          kind="container"
          targetId={inspectTarget.id}
          targetLabel={inspectTarget.name}
          onClose={() => setInspectTarget(null)}
        />
      ) : null}

      {execTarget ? (
        <ContainerExecDialog
          open={execTarget !== null}
          serverId={serverId}
          containerId={execTarget.id}
          containerName={execTarget.name}
          onClose={() => setExecTarget(null)}
        />
      ) : null}

      <RunContainerDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} serverId={serverId} />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="删除容器"
        description={removeDescription}
        destructive
        confirmText={removeConfirmText}
        onConfirm={() => {
          if (!removeTarget) return
          const force = removeTarget.state === 'running'
          runAction(removeTarget.id, 'remove', force)
        }}
      />
    </PanelShell>
  )
}
