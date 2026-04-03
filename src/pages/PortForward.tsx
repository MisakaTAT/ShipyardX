import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { openUrl } from '@tauri-apps/plugin-opener'
import { toast } from 'sonner'
import { ArrowLeftRight, Loader2, Play, Plus, Search, Square, Trash2, X } from 'lucide-react'

import type { Container, LocalAddress, PortForward, ServerConfig } from '@/types/app-bindings'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { cn } from '@/lib/utils'
import { formatBytes, formatSpeed } from '@/utils/formatBytes'

type ContainerPortOption = {
  container_port: number
  label: string
}

function parseContainerPortOptions(ports: string): ContainerPortOption[] {
  if (!ports) return []
  const rawItems = ports
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const out: ContainerPortOption[] = []
  const seen = new Set<number>()

  for (const raw of rawItems) {
    const m = raw.match(/^(.+):(\d+)->(\d+)\/([a-zA-Z0-9]+)$/)
    if (!m) continue
    const containerPort = Number(m[3])
    const protocol = String(m[4]).toLowerCase()
    if (!Number.isFinite(containerPort)) continue
    if (protocol !== 'tcp') continue
    if (containerPort < 1 || containerPort > 65535) continue
    if (seen.has(containerPort)) continue
    seen.add(containerPort)
    out.push({
      container_port: containerPort,
      label: `${containerPort}/TCP`,
    })
  }

  out.sort((a, b) => a.container_port - b.container_port)
  return out
}

function StatusBadge({ running, enabled }: { running?: boolean; enabled: boolean }) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        监听中
      </span>
    )
  }
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        待启动
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-(--bg-surface) px-2 py-0.5 text-xs font-medium text-(--text-muted)">
      <span className="h-1.5 w-1.5 rounded-full bg-(--text-muted)/40" />
      已禁用
    </span>
  )
}

type SpeedSnapshot = Record<string, { tx: number; rx: number; ts: number }>
type SpeedMap = Record<string, { txSpeed: number; rxSpeed: number }>

export default function PortForwardPage() {
  const [rules, setRules] = useState<PortForward[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const prevBytesRef = useRef<SpeedSnapshot>({})
  const [speeds, setSpeeds] = useState<SpeedMap>({})
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const [localAddresses, setLocalAddresses] = useState<LocalAddress[]>([
    { ip: '0.0.0.0', name: '所有网卡 (0.0.0.0)' },
    { ip: '127.0.0.1', name: '127.0.0.1 (localhost)' },
  ])

  const [showCreate, setShowCreate] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const [servers, setServers] = useState<ServerConfig[]>([])
  const [serversLoading, setServersLoading] = useState(false)
  const [createServerId, setCreateServerId] = useState<string>('')

  const [containers, setContainers] = useState<Container[]>([])
  const [containersLoading, setContainersLoading] = useState(false)
  const [createContainerId, setCreateContainerId] = useState('')

  const selectedCreateContainer = useMemo(
    () => containers.find((c) => c.id === createContainerId) ?? null,
    [containers, createContainerId],
  )
  const portOptions = useMemo(
    () => parseContainerPortOptions(selectedCreateContainer?.ports ?? ''),
    [selectedCreateContainer],
  )

  const [createContainerPort, setCreateContainerPort] = useState<number>(0)
  const [localPort, setLocalPort] = useState<number>(0)
  const [bindAddress, setBindAddress] = useState('127.0.0.1')

  const serverById = useMemo(() => {
    const m = new Map<string, ServerConfig>()
    for (const s of servers) m.set(s.id, s)
    return m
  }, [servers])

  const enabledCount = rules.filter((r) => r.enabled).length
  const runningCount = rules.filter((r) => r.running).length

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rules
    return rules.filter((r) => {
      const server = serverById.get(r.server_id)
      const serverText = `${server?.name ?? ''} ${server?.host ?? ''} ${r.server_id}`.toLowerCase()
      const target = `${r.remote_host}:${r.remote_port}`.toLowerCase()
      const local = String(r.local_port)
      const err = String(r.last_error ?? '').toLowerCase()
      const cid = String(r.container_id ?? '').toLowerCase()
      const cname = String(r.container_name ?? '').toLowerCase()
      return (
        serverText.includes(q) ||
        target.includes(q) ||
        local.includes(q) ||
        err.includes(q) ||
        cid.includes(q) ||
        cname.includes(q)
      )
    })
  }, [rules, search, serverById])

  const fetchRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const data = await commands.listPortForwardsAll()
      setRules(data)

      const now = Date.now()
      const prev = prevBytesRef.current
      const newSpeeds: SpeedMap = {}
      const newSnapshot: SpeedSnapshot = {}
      for (const r of data) {
        newSnapshot[r.id] = { tx: r.tx_bytes, rx: r.rx_bytes, ts: now }
        const p = prev[r.id]
        if (p && r.running) {
          const dt = (now - p.ts) / 1000
          if (dt > 0) {
            newSpeeds[r.id] = {
              txSpeed: Math.max(0, (r.tx_bytes - p.tx) / dt),
              rxSpeed: Math.max(0, (r.rx_bytes - p.rx) / dt),
            }
          }
        }
      }
      prevBytesRef.current = newSnapshot
      setSpeeds(newSpeeds)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setRulesLoading(false)
    }
  }, [])

  const loadLocalAddresses = useCallback(async () => {
    try {
      const data = await commands.listLocalAddresses()
      if (data.length > 0) setLocalAddresses(data)
    } catch {
      // fallback to defaults already set
    }
  }, [])

  const loadServers = useCallback(async () => {
    setServersLoading(true)
    try {
      const data = await commands.getServers()
      setServers(data)
      if (!createServerId && data.length > 0) setCreateServerId(data[0].id)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setServersLoading(false)
    }
  }, [createServerId])

  const fetchContainersForCreate = useCallback(async () => {
    if (!createServerId) return
    setContainersLoading(true)
    try {
      const data = await commands.listContainers(createServerId)
      setContainers(data)
      setCreateContainerId(data.length > 0 ? data[0].id : '')
    } catch (e) {
      toast.error(String(e))
    } finally {
      setContainersLoading(false)
    }
  }, [createServerId])

  useEffect(() => {
    void loadServers()
    void fetchRules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  useEffect(() => {
    if (!showCreate) return
    void loadServers()
    void loadLocalAddresses()
    void fetchContainersForCreate()
    setLocalPort(0)
    setCreateContainerPort(0)
  }, [showCreate, loadServers, fetchContainersForCreate])

  useEffect(() => {
    if (!showCreate) return
    setCreateContainerPort(portOptions.length > 0 ? portOptions[0].container_port : 0)
  }, [showCreate, portOptions])

  useEffect(() => {
    if (runningCount === 0) return

    let timer: number | undefined

    const start = () => {
      if (timer == null && !document.hidden) {
        void fetchRules()
        timer = window.setInterval(() => void fetchRules(), 3000)
      }
    }
    const stop = () => {
      if (timer != null) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchRules, runningCount])

  const handleCreate = async () => {
    if (!createServerId) {
      toast.error('请选择主机')
      return
    }
    if (!selectedCreateContainer) {
      toast.error('请选择容器')
      return
    }
    if (!createContainerPort) {
      toast.error('请选择容器端口')
      return
    }

    setCreateSubmitting(true)
    try {
      const created = await commands.createPortForwardRule(createServerId, {
        container_id: selectedCreateContainer.id,
        container_name: selectedCreateContainer.name || null,
        remote_host: selectedCreateContainer.ip,
        remote_port: createContainerPort,
        container_port: createContainerPort,
        protocol: 'tcp',
        local_port: localPort,
        bind_address: bindAddress.trim() || null,
        enabled: true,
      })
      toast.success(`已创建转发规则（本地端口：${created.local_port}）`)
      setShowCreate(false)
      await fetchRules()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleStartAll = async () => {
    try {
      await commands.startAllEnabledGlobal()
      toast.success('已启动所有已启用规则')
      await fetchRules()
    } catch (e) {
      toast.error(String(e))
    }
  }

  const handleStopAll = async () => {
    try {
      await commands.stopAllGlobal()
      toast.success('已停止所有转发')
      await fetchRules()
    } catch (e) {
      toast.error(String(e))
    }
  }

  const handleSetEnabled = async (id: string, enabled: boolean) => {
    try {
      await commands.setPortForwardEnabled(id, enabled)
      toast.success(enabled ? '规则已启用' : '规则已禁用')
      await fetchRules()
    } catch (e) {
      toast.error(String(e))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await commands.deletePortForward(id)
      toast.success('已删除规则')
      await fetchRules()
    } catch (e) {
      toast.error(String(e))
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg-app)' }}>
      <div className="flex-1 overflow-auto p-2 md:p-3">
        <div className={cn('flex h-full flex-col', rules.length > 0 && 'gap-3')}>
          {/* Page Header */}
          {rules.length > 0 ? (
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-(--text-strong)">端口转发</h1>
                  <p className="mt-0.5 text-xs text-(--text-muted)">
                    管理 SSH 隧道端口转发规则，将远程容器端口映射到本地。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {runningCount > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5 border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      onClick={() => void handleStopAll()}
                      disabled={rulesLoading}
                    >
                      <Square className="size-3.5" />
                      停止
                    </Button>
                  ) : enabledCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5  "
                      onClick={() => void handleStartAll()}
                      disabled={rulesLoading}
                    >
                      <Play className="size-3.5" />
                      启动
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
                    <Plus className="size-3.5 stroke-[2.5]" />
                    创建规则
                  </Button>
                </div>
              </div>

              {/* Search */}
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-(--text-muted)" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder='搜索主机、容器、端口或错误信息… ("/" 快速聚焦)'
                  className="pr-8 pl-9"
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
            </div>
          ) : null}

          {/* Content */}
          <div
            className="flex-1 overflow-hidden rounded-xl border border-border"
            style={{ background: 'var(--bg-panel)' }}
          >
            {rulesLoading && rules.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-(--text-muted)" />
              </div>
            ) : rules.length === 0 ? (
              <EmptyState onCreate={() => setShowCreate(true)} />
            ) : filteredRules.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center">
                <Search className="size-7 text-(--border-sub)" />
                <p className="mt-2 text-sm text-(--text-muted)">没有匹配「{search}」的规则</p>
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className={dataTableHead.first}>主机</TableHead>
                      <TableHead className={dataTableHead.mid}>容器</TableHead>
                      <TableHead className={dataTableHead.mid}>协议</TableHead>
                      <TableHead className={dataTableHead.mid} style={{ minWidth: '200px' }}>
                        本地端口
                      </TableHead>
                      <TableHead className={dataTableHead.mid}>目标</TableHead>
                      <TableHead className={dataTableHead.mid}>状态</TableHead>
                      <TableHead className={dataTableHead.mid} style={{ minWidth: '160px' }}>
                        流量
                      </TableHead>
                      <TableHead className={dataTableHead.mid} style={{ minWidth: '160px' }}>
                        速度
                      </TableHead>
                      <TableHead className={dataTableHead.last}>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRules.map((f) => {
                      const server = serverById.get(f.server_id)
                      return (
                        <TableBodyRow key={f.id}>
                          <TableCell className="px-5 py-3">
                            <div className="font-medium" style={{ color: 'var(--text-strong)' }}>
                              {server?.name ?? f.server_id}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="font-medium" style={{ color: 'var(--text-strong)' }}>
                              {f.container_name ?? f.container_id.slice(0, 12)}
                            </div>
                            <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {f.container_id.slice(0, 12)}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <span className="inline-block rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase text-blue-500">
                              {f.protocol}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-soft)' }}>
                            {f.running ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                                style={{ color: 'var(--text-strong)' }}
                                title="在浏览器中打开"
                                onClick={() => {
                                  void openUrl(`http://${f.bind_address}:${f.local_port}`)
                                }}
                              >
                                {f.bind_address}:{f.local_port}
                              </button>
                            ) : f.local_port > 0 ? (
                              <>
                                {f.bind_address}:{f.local_port}
                              </>
                            ) : (
                              <span className="uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                                random
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-soft)' }}>
                            {f.remote_host}:{f.remote_port}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <StatusBadge running={f.running} enabled={f.enabled} />
                              {f.last_error ? (
                                <span className="text-red-500 cursor-help" title={f.last_error}>
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 16 16"
                                    fill="currentColor"
                                    className="size-3.5"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell
                            className="px-4 py-3 text-xs font-mono tabular-nums"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex w-5 justify-center rounded font-sans text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
                                  TX
                                </span>
                                <span>{formatBytes(f.tx_bytes)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-flex w-5 justify-center rounded font-sans text-[10px] font-medium bg-sky-500/15 text-sky-400">
                                  RX
                                </span>
                                <span>{formatBytes(f.rx_bytes)}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell
                            className="px-4 py-3 text-xs font-mono tabular-nums"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {(() => {
                              const sp = f.running ? speeds[f.id] : undefined
                              return (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex w-5 justify-center rounded font-sans text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
                                      TX
                                    </span>
                                    <span>{formatSpeed(sp?.txSpeed ?? 0)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex w-5 justify-center rounded font-sans text-[10px] font-medium bg-sky-500/15 text-sky-400">
                                      RX
                                    </span>
                                    <span>{formatSpeed(sp?.rxSpeed ?? 0)}</span>
                                  </div>
                                </div>
                              )
                            })()}
                          </TableCell>
                          <TableCell className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title={f.enabled ? '禁用' : '启用'}
                                onClick={() => void handleSetEnabled(f.id, !f.enabled)}
                                className={cn(
                                  'rounded-lg text-(--text-muted)',
                                  f.enabled
                                    ? 'hover:bg-amber-500/10 hover:text-amber-500'
                                    : 'hover:bg-green-500/10 hover:text-green-500',
                                )}
                              >
                                {f.enabled ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title="删除"
                                onClick={() => void handleDelete(f.id)}
                                className={cn(
                                  'rounded-lg text-(--text-muted)',
                                  'hover:bg-red-500/10 hover:text-red-500',
                                )}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableBodyRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(next) => {
          if (!next && !createSubmitting) setShowCreate(false)
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
            <ArrowLeftRight className="size-4 text-(--accent-text)" />
            <DialogTitle className="flex-1 text-sm font-semibold text-(--text-strong)">创建转发规则</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
              disabled={createSubmitting}
              onClick={() => setShowCreate(false)}
            >
              <X className="size-4" />
            </Button>
          </DialogHeader>

          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-(--text-muted)">主机</label>
              <Select
                value={createServerId}
                onValueChange={(v) => setCreateServerId(v)}
                disabled={createSubmitting || serversLoading || servers.length === 0}
              >
                <SelectTrigger className="w-full border-(--border-sub) bg-(--bg-input) font-mono text-sm">
                  <SelectValue placeholder="选择主机" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-(--text-muted)">容器</label>
              {containersLoading ? (
                <div className="flex items-center justify-center h-9">
                  <Loader2 className="size-4 animate-spin text-(--text-muted)" />
                </div>
              ) : (
                <Select
                  value={createContainerId}
                  onValueChange={(v) => setCreateContainerId(v)}
                  disabled={createSubmitting || containers.length === 0}
                >
                  <SelectTrigger className="w-full border-(--border-sub) bg-(--bg-input) font-mono text-sm">
                    <SelectValue placeholder="选择容器" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {containers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-(--text-muted)">容器端口</label>
              {portOptions.length === 0 ? (
                <div className="text-xs text-(--text-muted)">该容器没有可用 TCP 端口</div>
              ) : (
                <Select
                  value={String(createContainerPort)}
                  onValueChange={(v) => setCreateContainerPort(Number(v))}
                  disabled={createSubmitting}
                >
                  <SelectTrigger className="w-full border-(--border-sub) bg-(--bg-input) font-mono text-sm">
                    <SelectValue placeholder="选择端口" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {portOptions.map((p) => (
                      <SelectItem key={p.container_port} value={String(p.container_port)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-(--text-muted)">绑定地址</label>
              <Select value={bindAddress} onValueChange={(v) => setBindAddress(v)} disabled={createSubmitting}>
                <SelectTrigger className="w-full border-(--border-sub) bg-(--bg-input) font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {localAddresses.map((o) => (
                    <SelectItem key={o.ip} value={o.ip}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-(--text-muted)">本地端口（0 = 随机）</label>
              <Input
                type="number"
                min={0}
                max={65535}
                value={localPort}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setLocalPort(Number.isFinite(v) ? v : 0)
                }}
                disabled={createSubmitting}
                className="border-(--border-sub) bg-(--bg-input) font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={createSubmitting}
                onClick={() => setShowCreate(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={createSubmitting || !createServerId || !createContainerId || !createContainerPort}
                onClick={() => void handleCreate()}
              >
                {createSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                创建
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-xs text-center">
        <div
          className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
        >
          <ArrowLeftRight className="size-7 text-(--accent-text)" />
        </div>
        <h2 className="text-sm font-semibold text-(--text-strong)">尚未创建转发规则</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-(--text-muted)">
          创建端口转发规则，将远程容器的 TCP 端口通过 SSH 隧道映射到本地，方便本地开发与调试。
        </p>
        <Button size="sm" className="mt-5 gap-1.5" onClick={onCreate}>
          <Plus className="size-3.5 stroke-[2.5]" />
          创建规则
        </Button>
      </div>
    </div>
  )
}
