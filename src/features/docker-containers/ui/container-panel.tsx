import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, ChevronDown, HeartCrack, HeartPulse, Plus, Trash2 } from 'lucide-react'
import type { Container } from '@/types/app-bindings'
import LogDialog from '@/features/docker-containers/ui/log-dialog'
import StatsDialog from '@/features/docker-containers/ui/stats-dialog'
import ContainerExecDialog from '@/features/docker-containers/ui/container-exec-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { ConfirmDialog, DataTable, PanelHeader, PanelShell, type ColumnDef } from '@/shared/components'
import { ContainerStateBadge } from '@/features/docker-containers/ui/container-state-badge'
import { ContainerActionsMenu } from '@/features/docker-containers/ui/container-actions-menu'
import RunContainerDialog from '@/features/docker-containers/ui/run-container/run-container-dialog'
import { ContainerPortsCell } from '@/features/docker-containers/ui/container-ports-cell'
import { shouldForceRemoveContainer } from '@/features/docker-containers/lib/container-state'
import { consumeNextContainerSearch } from '@/shared/lib/workspace-nav'
import {
  useContainerAction,
  useContainers,
  usePruneStoppedContainers,
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
  const { t } = useTranslation()
  const { data: containers = [], isFetching, dataUpdatedAt } = useContainers(serverId)
  const action = useContainerAction(serverId)
  const pruneStoppedContainers = usePruneStoppedContainers(serverId)

  const [search, setSearch] = useState('')
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [logTarget, setLogTarget] = useState<Container | null>(null)
  const [statsTarget, setStatsTarget] = useState<Container | null>(null)
  const [execTarget, setExecTarget] = useState<Container | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Container | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Container | null>(null)
  const [cleanupOpen, setCleanupOpen] = useState(false)

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
        header: t('ui.common.name'),
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
        header: t('ui.containers.colImage'),
        cell: ({ row }) => <span title={row.original.image}>{row.original.image}</span>,
      },

      {
        id: 'state',
        header: t('ui.containers.colState'),
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
        header: t('ui.containers.colPorts'),
        meta: { width: '14rem' },
        cell: ({ row }) => <ContainerPortsCell ports={row.original.ports} />,
      },
      {
        id: 'created',
        header: t('ui.common.created'),
        cell: ({ row }) => <span title={row.original.created_at || undefined}>{row.original.created_ago}</span>,
      },
      {
        id: 'actions',
        header: t('ui.common.actions'),
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
    [t, action.isPending]
  )

  const removeDescription = removeTarget
    ? shouldForceRemoveContainer(removeTarget.state)
      ? t('ui.containers.forceRemoveDesc', { name: removeTarget.name })
      : t('ui.containers.removeDesc', { name: removeTarget.name })
    : ''
  const removeConfirmText =
    removeTarget && shouldForceRemoveContainer(removeTarget.state)
      ? t('ui.containers.forceRemove')
      : t('ui.common.delete')

  return (
    <PanelShell>
      <PanelHeader
        icon={Box}
        title={t('ui.containers.title')}
        stats={
          containers.length > 0
            ? t('ui.containers.runningStats', { running: String(runningCount), total: String(containers.length) })
            : undefined
        }
        search={{ value: search, onChange: setSearch }}
        lastUpdated={dataUpdatedAt}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" />}>
              {t('ui.common.actions')}
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              <DropdownMenuItem onClick={() => setRunDialogOpen(true)}>
                <Plus className="size-3.5" />
                {t('ui.containers.run')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupOpen(true)}>
                <Trash2 className="size-3.5" />
                {t('ui.containers.pruneTitle')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <DataTable<Container>
        columns={columns}
        data={filtered}
        getRowId={(c) => c.id}
        loading={isFetching && containers.length === 0}
        empty={{ icon: Box, title: search ? t('ui.containers.noMatch', { query: search }) : t('ui.containers.empty') }}
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
        title={t('ui.containers.deleteTitle')}
        description={removeDescription}
        destructive
        confirmText={removeConfirmText}
        onConfirm={() => {
          if (!removeTarget) return
          const force = shouldForceRemoveContainer(removeTarget.state)
          runAction(removeTarget.id, 'remove', force)
        }}
      />

      <ConfirmDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        title={t('ui.containers.pruneTitle')}
        description={t('ui.containers.pruneDesc')}
        destructive
        confirmText={t('ui.containers.pruneTitle')}
        onConfirm={() => {
          pruneStoppedContainers.mutate()
        }}
      />
    </PanelShell>
  )
}
