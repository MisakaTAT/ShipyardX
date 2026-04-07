import { useState, useEffect, useCallback, useRef } from 'react'
import { commands } from '@/types/app-bindings'
import { toast } from 'sonner'
import {
  BarChart2,
  Box,
  FileText,
  Loader2,
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
import { PanelToolbar, PanelToolbarHeading, PanelToolbarSearch } from '@/components/ui/panel-toolbar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableBodyRow,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  dataTableHead,
} from '@/components/ui/table'
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

const CONTAINER_STATE_LABEL: Record<string, string> = {
  created: '已创建',
  running: '运行中',
  paused: '已暂停',
  restarting: '重启中',
  removing: '删除中',
  exited: '已停止',
  dead: '已停止',
}

type StateTone = 'green' | 'red' | 'yellow' | 'amber' | 'blue' | 'muted'

function stateTone(s: string): StateTone {
  if (s === 'running') return 'green'
  if (s === 'exited' || s === 'dead') return 'red'
  if (s === 'paused') return 'yellow'
  if (s === 'restarting' || s === 'removing') return 'amber'
  if (s === 'created') return 'blue'
  return 'muted'
}

const TONE_CLASSES: Record<StateTone, { wrap: string; dot: string; pulse?: boolean }> = {
  green: {
    wrap: 'bg-green-500/10 text-green-500 border-green-500/30',
    dot: 'bg-green-500',
    pulse: true,
  },
  red: {
    wrap: 'bg-red-500/10 text-red-500 border-red-500/30',
    dot: 'bg-red-500',
  },
  yellow: {
    wrap: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    dot: 'bg-yellow-500',
  },
  amber: {
    wrap: 'bg-amber-500/10 text-amber-600 border-amber-500/35 dark:text-amber-400',
    dot: 'bg-amber-500',
    pulse: true,
  },
  blue: {
    wrap: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    dot: 'bg-blue-500',
  },
  muted: {
    wrap: '',
    dot: '',
  },
}

function StateBadge({ state }: { state: string }) {
  const s = state.toLowerCase().trim()
  const label = CONTAINER_STATE_LABEL[s] ?? state
  const tone = stateTone(s)
  const t = TONE_CLASSES[tone]

  if (tone === 'muted') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        {label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${t.wrap}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot} ${t.pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
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

  const runAction = async (
    containerId: string,
    action: string,
    command: string,
    args: Record<string, unknown> = {}
  ) => {
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
  }

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
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
            <Box className="mb-3 h-10 w-10 text-border" />
            <p className="text-sm">{search ? `无匹配的容器 "${search}"` : '没有容器'}</p>
          </div>
        ) : (
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className={dataTableHead.first}>名称</TableHead>
                <TableHead className={dataTableHead.mid}>镜像</TableHead>
                <TableHead className={dataTableHead.mid} style={{ minWidth: '160px' }}>
                  状态
                </TableHead>
                <TableHead className={dataTableHead.mid}>IP</TableHead>
                <TableHead className={dataTableHead.mid}>端口</TableHead>
                <TableHead className={dataTableHead.mid}>创建时间</TableHead>
                <TableHead className={dataTableHead.last}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const busy = actionLoading[c.id]
                const isRunning = c.state === 'running'
                return (
                  <TableBodyRow key={c.id}>
                    <TableCell className="px-5 py-3">
                      <div className="font-medium text-foreground">{c.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">{c.id}</div>
                    </TableCell>
                    <TableCell className="max-w-[200px] px-4 py-3">
                      <span className="block truncate font-mono text-xs text-muted-foreground" title={c.image}>
                        {c.image}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-40 px-4 py-3">
                      <StateBadge state={c.state} />
                      <div className="mt-1 truncate text-xs text-muted-foreground" title={c.status}>
                        {c.status}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{c.ip || '-'}</span>
                    </TableCell>
                    <TableCell className="max-w-[220px] px-4 py-3">
                      {c.ports ? (
                        <PortCell ports={c.ports} />
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      <span title={formatUnixSeconds(c.created_ts)}>{formatUnixSeconds(c.created_ts)}</span>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghostAccent" icon title="更多操作">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => runAction(c.id, 'start', 'start_container')}
                              disabled={isRunning || Boolean(busy)}
                            >
                              <Play />
                              启动
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => runAction(c.id, 'stop', 'stop_container')}
                              disabled={!isRunning || Boolean(busy)}
                            >
                              <Square />
                              停止
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => runAction(c.id, 'restart', 'restart_container')}
                              disabled={Boolean(busy)}
                            >
                              <RotateCcw />
                              重启
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setExecTarget(c)} disabled={!isRunning}>
                              <Terminal />
                              容器终端
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatsTarget(c)} disabled={!isRunning}>
                              <BarChart2 />
                              资源监控
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setLogTarget(c)}>
                              <FileText />
                              日志
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setInspectTarget(c)}>
                              <ScanSearch />
                              Inspect
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setRemoveTarget(c)}
                              disabled={Boolean(busy)}
                            >
                              <Trash2 />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableBodyRow>
                )
              })}
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
