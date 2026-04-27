import { useEffect, useMemo, useState } from 'react'
import { Box, HeartCrack, HeartPulse, Plus } from 'lucide-react'
import type { Container } from '@/types/app-bindings'
import LogDialog from '@/features/docker-containers/ui/log-dialog'
import StatsDialog from '@/features/docker-containers/ui/stats-dialog'
import ContainerExecDialog from '@/features/docker-containers/ui/container-exec-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { formatTimeAgo, formatUnixSeconds } from '@/shared/lib/datetime'
import { ConfirmDialog, DataTable, PanelHeader, PanelShell, type ColumnDef } from '@/shared/components'
import { ContainerStateBadge } from '@/features/docker-containers/ui/container-state-badge'
import { TruncatedChips } from '@/shared/components/truncated-chips'
import { ContainerActionsMenu } from '@/features/docker-containers/ui/container-actions-menu'
import RunContainerDialog from '@/features/docker-containers/ui/run-container/run-container-dialog'
import { consumeNextContainerSearch } from '@/shared/lib/workspace-nav'
import {
  useContainerAction,
  useContainers,
  type ContainerAction,
} from '@/features/docker-containers/api/use-containers'

interface ContainerPanelProps {
  serverId: string
}

function getContainerHealth(status: string): 'healthy' | 'unhealthy' | 'unknown' {
  const s = status.toLowerCase()
  if (s.includes('(healthy)')) return 'healthy'
  if (s.includes('(unhealthy)')) return 'unhealthy'
  return 'unknown'
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

  useEffect(() => {
    const next = consumeNextContainerSearch(serverId)
    if (next) setSearch(next)
  }, [serverId])

  const filtered = useMemo(() => {
    if (!search.trim()) return containers
    const q = search.toLowerCase()
    return containers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q) ||
        c.stack.toLowerCase().includes(q) ||
        c.volumes.some((v) => v.toLowerCase().includes(q)) ||
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
        id: 'name',
        header: '名称',
        cell: ({ row }) => {
          const c = row.original
          return (
            <>
              <div className="font-medium text-foreground">{c.name}</div>
              <div>{c.id}</div>
            </>
          )
        },
      },
      {
        id: 'image',
        header: '镜像',
        cell: ({ row }) => <span title={row.original.image}>{row.original.image}</span>,
      },

      {
        id: 'state',
        header: '状态',
        cell: ({ row }) => {
          const c = row.original
          return <ContainerStateBadge state={c.state} />
        },
      },
      {
        id: 'health',
        header: 'Health',
        meta: { width: '12rem' },
        cell: ({ row }) => {
          const c = row.original
          const health = getContainerHealth(c.status)
          if (health === 'healthy') {
            return (
              <div className="min-w-0">
                <span className="inline-flex items-center text-emerald-700 dark:text-emerald-400" title={c.status}>
                  <HeartPulse className="size-4" />
                </span>
                <div className="mt-1 truncate text-xs text-muted-foreground" title={c.status}>
                  {c.status}
                </div>
              </div>
            )
          }
          if (health === 'unhealthy') {
            return (
              <div className="min-w-0">
                <span className="inline-flex items-center text-red-700 dark:text-red-400" title={c.status}>
                  <HeartCrack className="size-4" />
                </span>
                <div className="mt-1 truncate text-xs text-muted-foreground" title={c.status}>
                  {c.status}
                </div>
              </div>
            )
          }
          return (
            <div className="min-w-0">
              <span className="text-xs text-muted-foreground">-</span>
              {c.status ? (
                <div className="mt-1 truncate text-xs text-muted-foreground" title={c.status}>
                  {c.status}
                </div>
              ) : null}
            </div>
          )
        },
      },
      {
        id: 'stack',
        header: 'Stack',
        cell: ({ row }) => <span title={row.original.stack}>{row.original.stack || '-'}</span>,
      },
      {
        id: 'ip',
        header: 'IP',
        cell: ({ row }) => <span>{row.original.ip || '-'}</span>,
      },
      {
        id: 'ports',
        header: '端口',
        meta: { width: '12rem' },
        cell: ({ row }) => (
          <TruncatedChips
            items={row.original.ports ? row.original.ports.split(',') : []}
            maxVisible={2}
            title={row.original.ports || undefined}
          />
        ),
      },
      {
        id: 'created',
        header: '创建时间',
        cell: ({ row }) => (
          <span title={formatUnixSeconds(row.original.created_ts)}>{formatTimeAgo(row.original.created_ts)}</span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        meta: { width: '3rem' },
        cell: ({ row }) => {
          const c = row.original
          return (
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
          )
        },
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
            运行容器
          </Button>
        }
      />

      <DataTable<Container>
        columns={columns}
        data={filtered}
        getRowId={(c) => c.id}
        loading={isFetching && containers.length === 0}
        empty={{ icon: Box, title: search ? `无匹配的容器 "${search}"` : '没有容器' }}
        tableClassName="[&_tbody_tr]:h-16 [&_tbody_tr_td]:h-16"
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
