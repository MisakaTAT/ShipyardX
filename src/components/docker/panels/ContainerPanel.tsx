import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { commands } from '@/types/app-bindings'
import { toast } from 'sonner'
import {
  BarChart2,
  Box,
  FileText,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  ScanSearch,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react'
import type { Container } from '@/types/app-bindings'
import LogDialog from '@/components/docker/dialogs/LogDialog'
import StatsDialog from '@/components/docker/dialogs/StatsDialog'
import ContainerExecDialog from '@/components/docker/dialogs/ContainerExecDialog'
import InspectDialog from '@/components/docker/dialogs/InspectDialog'
import RunContainerDialog from '@/components/docker/dialogs/RunContainerDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { ContainerStateBadge } from '@/components/ui/badge'
import { EmptyState, PanelListLoading } from '@/components/ui/empty-state'
import { PanelToolbar, PanelToolbarHeading, PanelToolbarSearch } from '@/components/ui/panel-toolbar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { formatNowTime, formatUnixSeconds } from '@/utils/datetime'

interface ContainerPanelProps {
  serverId: string
  refreshTick?: number
}

function parsePorts(ports: string): string[] {
  return ports
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function ContainerPanel({ serverId, refreshTick }: ContainerPanelProps) {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [logTarget, setLogTarget] = useState<Container | null>(null)
  const [statsTarget, setStatsTarget] = useState<Container | null>(null)
  const [execTarget, setExecTarget] = useState<Container | null>(null)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Container | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Container | null>(null)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchContainers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await commands.listContainers(serverId)
      setContainers(data)
      setLastUpdated(formatNowTime())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchContainers()
  }, [fetchContainers, refreshTick])

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

  const runAction = useCallback(
    async (containerId: string, action: string, command: string, args: Record<string, unknown> = {}) => {
      setActionLoading((prev) => ({ ...prev, [containerId]: action }))
      try {
        switch (command) {
          case 'start_container':
            await commands.startContainer(serverId, containerId)
            break
          case 'stop_container':
            await commands.stopContainer(serverId, containerId)
            break
          case 'restart_container':
            await commands.restartContainer(serverId, containerId)
            break
          case 'remove_container':
            await commands.removeContainer(serverId, containerId, Boolean(args.force))
            break
          default:
            throw new Error(`Unknown container command: ${command}`)
        }
        await fetchContainers()
      } catch (e) {
        toast.error(String(e))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[containerId]
          return next
        })
      }
    },
    [serverId, fetchContainers]
  )

  const filtered = containers.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.image.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    )
  })

  const containerColumns = useMemo<DataTableColumn<Container>[]>(
    () => [
      {
        key: 'name',
        title: '名称',
        render: (_, c) => (
          <>
            <div className="font-medium text-foreground">{c.name}</div>
            <div className="text-muted-foreground">{c.id}</div>
          </>
        ),
      },
      {
        key: 'image',
        title: '镜像',
        render: (_, c) => <span title={c.image}>{c.image}</span>,
      },
      {
        key: 'state',
        title: '状态',
        colWidth: '12rem',
        render: (_, c) => (
          <>
            <ContainerStateBadge state={c.state} />
            <br />
            <span title={c.status}>{c.status}</span>
          </>
        ),
      },
      {
        key: 'ip',
        title: 'IP',
        render: (_, c) => <span>{c.ip || '-'}</span>,
      },
      {
        key: 'ports',
        title: '端口',
        render: (_, c) => (c.ports ? <PortCell ports={c.ports} /> : <span>—</span>),
      },
      {
        key: 'created',
        title: '创建时间',
        render: (_, c) => <span title={formatUnixSeconds(c.created_ts)}>{formatUnixSeconds(c.created_ts)}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        colWidth: '3rem',
        render: (_, c) => {
          const busy = actionLoading[c.id]
          const isRunning = c.state === 'running'
          return (
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" icon title="更多操作">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onClick={() => runAction(c.id, 'start', 'start_container')}
                    disabled={isRunning || Boolean(busy)}
                  >
                    <Play className="size-3.5" />
                    启动
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => runAction(c.id, 'stop', 'stop_container')}
                    disabled={!isRunning || Boolean(busy)}
                  >
                    <Square className="size-3.5" />
                    停止
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => runAction(c.id, 'restart', 'restart_container')}
                    disabled={Boolean(busy)}
                  >
                    <RotateCcw className="size-3.5" />
                    重启
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setExecTarget(c)} disabled={!isRunning}>
                    <Terminal className="size-3.5" />
                    容器终端
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatsTarget(c)} disabled={!isRunning}>
                    <BarChart2 className="size-3.5" />
                    资源监控
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLogTarget(c)}>
                    <FileText className="size-3.5" />
                    日志
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setInspectTarget(c)}>
                    <ScanSearch className="size-3.5" />
                    Inspect
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget(c)} disabled={Boolean(busy)}>
                    <Trash2 className="size-3.5" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [actionLoading, runAction]
  )

  const runningCount = containers.filter((c) => c.state === 'running').length

  const removeDescription =
    removeTarget == null
      ? ''
      : removeTarget.state === 'running'
        ? `容器「${removeTarget.name}」正在运行，将使用强制移除。`
        : `确定要删除容器「${removeTarget.name}」吗？`
  const removeConfirmText = removeTarget?.state === 'running' ? '强制删除' : '删除'

  return (
    <div className="flex h-full flex-col bg-background">
      <PanelToolbar>
        <PanelToolbarHeading
          icon={<Box />}
          title="容器"
          meta={containers.length > 0 ? `${runningCount}/${containers.length} 运行中` : null}
        />

        <PanelToolbarSearch
          ref={searchRef}
          value={search}
          onValueChange={setSearch}
          placeholder='搜索… ("/" 快速聚焦)'
        />

        <div className="ml-auto flex items-center gap-2">
          {lastUpdated ? <span className="mr-1 text-xs text-muted-foreground">更新于 {lastUpdated}</span> : null}
          <Button type="button" variant="default" className="gap-1" onClick={() => setRunDialogOpen(true)}>
            <Plus />
            启动新容器
          </Button>
        </div>
      </PanelToolbar>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-card">
        {loading && containers.length === 0 ? (
          <PanelListLoading />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Box />} title={search ? `无匹配的容器 "${search}"` : '没有容器'} />
        ) : (
          <DataTable className="w-full table-fixed" rowKey="id" columns={containerColumns} rows={filtered} />
        )}
      </div>

      {logTarget && (
        <LogDialog
          serverId={serverId}
          containerId={logTarget.id}
          containerName={logTarget.name}
          onClose={() => setLogTarget(null)}
        />
      )}

      {statsTarget && (
        <StatsDialog
          serverId={serverId}
          containerId={statsTarget.id}
          containerName={statsTarget.name}
          onClose={() => setStatsTarget(null)}
        />
      )}

      {inspectTarget && (
        <InspectDialog
          serverId={serverId}
          kind="container"
          targetId={inspectTarget.id}
          targetLabel={inspectTarget.name}
          onClose={() => setInspectTarget(null)}
        />
      )}

      {execTarget && (
        <ContainerExecDialog
          open={execTarget !== null}
          serverId={serverId}
          containerId={execTarget.id}
          containerName={execTarget.name}
          onClose={() => setExecTarget(null)}
        />
      )}

      <RunContainerDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        serverId={serverId}
        onSuccess={() => void fetchContainers()}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="删除容器"
        description={removeDescription}
        confirmText={removeConfirmText}
        onConfirm={async () => {
          if (!removeTarget) return
          const c = removeTarget
          const isRunning = c.state === 'running'
          await runAction(c.id, 'remove', 'remove_container', { force: isRunning })
        }}
      />
    </div>
  )
}

function PortCell({ ports }: { ports: string }) {
  const list = parsePorts(ports)
  const visible = list.slice(0, 2)
  const hiddenCount = list.length - visible.length

  return (
    <div className="flex flex-wrap gap-1" title={ports}>
      {visible.map((port) => (
        <span
          key={port}
          className="inline-block max-w-[200px] truncate rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {port}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-block rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}
