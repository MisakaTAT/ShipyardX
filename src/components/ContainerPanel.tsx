import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Play,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  Loader2,
  Box,
  Search,
  X,
  BarChart2,
  Terminal,
  MoreHorizontal,
  ScanSearch,
} from 'lucide-react'
import type { Container } from '../types'
import LogModal from './LogModal'
import StatsModal from './StatsModal'
import ContainerExecModal from './ContainerExecModal'
import InspectModal from './InspectModal'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatUnixSeconds } from '@/utils/datetime'

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

function StateBadge({ state }: { state: string }) {
  const s = state.toLowerCase()
  if (s === 'running') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        运行中
      </span>
    )
  }
  if (s === 'exited' || s === 'dead') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        已停止
      </span>
    )
  }
  if (s === 'paused') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        已暂停
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ background: 'var(--bg-surface)', color: 'var(--text-soft)', borderColor: 'var(--border-sub)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
      {state}
    </span>
  )
}

export default function ContainerPanel({ serverId, refreshTick }: ContainerPanelProps) {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [logTarget, setLogTarget] = useState<Container | null>(null)
  const [statsTarget, setStatsTarget] = useState<Container | null>(null)
  const [execTarget, setExecTarget] = useState<Container | null>(null)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Container | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Container | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchContainers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await invoke<Container[]>('list_containers', { serverId })
      setContainers(data)
      setLastUpdated(new Date().toLocaleTimeString('zh-CN'))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchContainers()
  }, [fetchContainers])

  useEffect(() => {
    if (refreshTick && refreshTick > 0) fetchContainers()
  }, [refreshTick, fetchContainers])

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
    args: Record<string, unknown> = {},
  ) => {
    setActionLoading((prev) => ({ ...prev, [containerId]: action }))
    try {
      await invoke(command, { serverId, containerId, ...args })
      await fetchContainers()
    } catch (e) {
      setError(String(e))
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
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-app)' }}>
      {/* Toolbar */}
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3"
        style={{ background: 'var(--bg-panel)' }}
      >
        <Box className="w-4 h-4 shrink-0" style={{ color: 'var(--text-soft)' }} />
        <span className="text-sm font-medium mr-1" style={{ color: 'var(--text-base)' }}>
          容器
        </span>
        {containers.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {runningCount}/{containers.length} 运行中
          </span>
        )}

        {/* 搜索 */}
        <div className="relative ml-2">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索… ("/" 快速聚焦)'
            className="h-8 w-52 border-(--border-sub) bg-(--bg-input) pr-8 pl-8 text-xs text-(--text-base)"
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-(--text-muted)"
              onClick={() => setSearch('')}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>

        {lastUpdated ? (
          <div className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
            更新于 {lastUpdated}
          </div>
        ) : null}
      </div>

      {/* Error */}
      {error ? (
        <Alert
          variant="destructive"
          className="mx-5 mt-3 border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-500"
        >
          <AlertDescription className="flex items-start gap-2 text-red-500">
            <span className="flex-1">{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-red-400 hover:bg-transparent hover:text-red-300"
              onClick={() => setError('')}
            >
              <X className="size-3" />
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Content */}
      <div className="flex-1 overflow-auto bg-(--bg-panel)">
        {loading && containers.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
            <Box className="w-10 h-10 mb-3" style={{ color: 'var(--border-sub)' }} />
            <p className="text-sm">{search ? `无匹配的容器 "${search}"` : '没有容器'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 backdrop-blur-sm" style={{ background: 'var(--bg-panel)' }}>
              <tr className="border-b border-border">
                <th
                  className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  名称
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  镜像
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  状态
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  IP
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  端口
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  创建时间
                </th>
                <th
                  className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const busy = actionLoading[c.id]
                const isRunning = c.state === 'running'
                return (
                  <tr
                    key={c.id}
                    className="border-b border-border bg-(--bg-panel) transition-colors hover:bg-(--bg-surface)"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium" style={{ color: 'var(--text-strong)' }}>
                        {c.name}
                      </div>
                      <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {c.id}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span
                        className="text-xs font-mono truncate block"
                        style={{ color: 'var(--text-soft)' }}
                        title={c.image}
                      >
                        {c.image}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StateBadge state={c.state} />
                      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        {c.status}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono" style={{ color: 'var(--text-soft)' }}>
                        {c.ip || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {c.ports ? (
                        <PortCell ports={c.ports} />
                      ) : (
                        <span className="text-xs font-mono" style={{ color: 'var(--text-soft)' }}>
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span title={formatUnixSeconds(c.created_ts)}>{formatUnixSeconds(c.created_ts)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="rounded-lg text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
                              title="更多操作"
                            >
                              <MoreHorizontal className="size-3.5" />
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
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setRemoveTarget(c)}
                              disabled={Boolean(busy)}
                            >
                              <Trash2 className="size-3.5" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {logTarget && (
        <LogModal
          serverId={serverId}
          containerId={logTarget.id}
          containerName={logTarget.name}
          onClose={() => setLogTarget(null)}
        />
      )}

      {statsTarget && (
        <StatsModal
          serverId={serverId}
          containerId={statsTarget.id}
          containerName={statsTarget.name}
          onClose={() => setStatsTarget(null)}
        />
      )}

      {inspectTarget && (
        <InspectModal
          serverId={serverId}
          kind="container"
          targetId={inspectTarget.id}
          targetLabel={inspectTarget.name}
          onClose={() => setInspectTarget(null)}
        />
      )}

      {execTarget && (
        <ContainerExecModal
          open={execTarget !== null}
          serverId={serverId}
          containerId={execTarget.id}
          containerName={execTarget.name}
          onClose={() => setExecTarget(null)}
        />
      )}

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
          className="inline-block max-w-[200px] truncate px-1.5 py-0.5 rounded border text-[10px] font-mono"
          style={{
            color: 'var(--text-soft)',
            borderColor: 'var(--border-sub)',
            background: 'var(--bg-surface)',
          }}
        >
          {port}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span
          className="inline-block px-1.5 py-0.5 rounded border text-[10px]"
          style={{
            color: 'var(--text-muted)',
            borderColor: 'var(--border-sub)',
            background: 'var(--bg-surface)',
          }}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}
