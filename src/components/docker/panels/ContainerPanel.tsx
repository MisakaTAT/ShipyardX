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
  Search,
} from 'lucide-react'
import type { Container } from '@/types/app-bindings'
import LogDialog from '@/components/docker/dialogs/LogDialog'
import StatsDialog from '@/components/docker/dialogs/StatsDialog'
import ContainerExecDialog from '@/components/docker/dialogs/ContainerExecDialog'
import InspectDialog from '@/components/docker/dialogs/InspectDialog'
import RunContainerDialog from '@/components/docker/dialogs/RunContainerDialog'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNowTime, formatUnixSeconds } from '@/utils/datetime'

interface ContainerPanelProps {
  serverId: string
  refreshTick?: number
}
type DataTableColumn<T extends object> = {
  key: string
  title: React.ReactNode
  render?: (value: unknown, record: T, index: number) => React.ReactNode
  colWidth?: string
}

function parsePorts(ports: string): string[] {
  return ports
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function ContainerStateBadge({ state }: { state: string }) {
  const s = state.toLowerCase().trim()
  const labelMap: Record<string, string> = {
    created: '已创建',
    running: '运行中',
    paused: '已暂停',
    restarting: '重启中',
    removing: '删除中',
    exited: '已停止',
    dead: '已停止',
  }
  const label = labelMap[s] ?? state
  const tone =
    s === 'running'
      ? 'bg-green-500'
      : s === 'exited' || s === 'dead'
        ? 'bg-red-500'
        : s === 'paused'
          ? 'bg-yellow-500'
          : s === 'restarting' || s === 'removing'
            ? 'bg-amber-500'
            : s === 'created'
              ? 'bg-blue-500'
              : 'bg-muted-foreground'
  return (
    <Badge variant="outline" className="h-auto rounded-full px-2 py-0.5 text-xs">
      <span className={`size-1.5 rounded-full ${tone}`} />
      {label}
    </Badge>
  )
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
                <DropdownMenuTrigger>
                  <Button type="button" variant="ghost" size="icon-sm" title="更多操作">
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
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-4">
        <div className="inline-flex items-center gap-2.5">
          <div className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground [&_svg]:size-4">
            <Box />
          </div>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span>容器</span>
            {containers.length > 0 ? (
              <span className="font-normal text-muted-foreground">
                {runningCount}/{containers.length} 运行中
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative ml-4 w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索… ("/" 快速聚焦)'
            className="w-full pl-9"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {lastUpdated ? <span className="mr-1 text-xs text-muted-foreground">更新于 {lastUpdated}</span> : null}
          <Button type="button" variant="default" className="gap-1" onClick={() => setRunDialogOpen(true)}>
            <Plus />
            启动新容器
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-card">
        {loading && containers.length === 0 ? (
          <div className="flex h-full min-h-48 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <div className="flex justify-center text-border [&_svg]:size-7">
              <Box />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{search ? `无匹配的容器 "${search}"` : '没有容器'}</p>
          </div>
        ) : (
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                {containerColumns.map((col) => (
                  <TableHead key={col.key} style={col.colWidth ? { width: col.colWidth } : undefined}>
                    {col.title}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, idx) => (
                <TableRow key={row.id}>
                  {containerColumns.map((col) => (
                    <TableCell key={col.key}>{col.render ? col.render(undefined, row, idx) : null}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除容器</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">{removeDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!removeTarget) return
                const c = removeTarget
                const isRunning = c.state === 'running'
                void runAction(c.id, 'remove', 'remove_container', { force: isRunning }).finally(() =>
                  setRemoveTarget(null)
                )
              }}
            >
              {removeConfirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
