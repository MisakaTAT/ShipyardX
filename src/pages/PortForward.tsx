import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { openUrl } from '@tauri-apps/plugin-opener'
import { toast } from 'sonner'
import { ArrowLeftRight, Play, Plus, Search, Square, Trash2 } from 'lucide-react'

import type { PortForward, ServerConfig } from '@/types/app-bindings'
import PortForwardCreateDialog from '@/components/server/dialogs/PortForwardCreateDialog'
import { Badge, PortForwardStatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState, PanelListLoading } from '@/components/ui/empty-state'
import { PageListColumn, PageScrollArea } from '@/components/ui/page-frame'
import { PanelToolbarSearch } from '@/components/ui/panel-toolbar'
import { cn } from '@/lib/utils'
import { formatBytes, formatSpeed } from '@/utils/formatBytes'

type SpeedSnapshot = Record<string, { tx: number; rx: number; ts: number }>
type SpeedMap = Record<string, { txSpeed: number; rxSpeed: number }>

export default function PortForwardPage() {
  const [rules, setRules] = useState<PortForward[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const prevBytesRef = useRef<SpeedSnapshot>({})
  const [speeds, setSpeeds] = useState<SpeedMap>({})
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const [showCreate, setShowCreate] = useState(false)

  const [servers, setServers] = useState<ServerConfig[]>([])

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

  const loadServers = useCallback(async () => {
    try {
      const data = await commands.getServers()
      setServers(data)
    } catch (e) {
      toast.error(String(e))
    }
  }, [])

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

  const handleSetEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await commands.setPortForwardEnabled(id, enabled)
        toast.success(enabled ? '规则已启用' : '规则已禁用')
        await fetchRules()
      } catch (e) {
        toast.error(String(e))
      }
    },
    [fetchRules]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await commands.deletePortForward(id)
        toast.success('已删除规则')
        await fetchRules()
      } catch (e) {
        toast.error(String(e))
      }
    },
    [fetchRules]
  )

  const portForwardColumns = useMemo<DataTableColumn<PortForward>[]>(
    () => [
      {
        key: 'container',
        title: '容器',
        render: (_, f) => (
          <>
            <div className="font-medium text-foreground">{f.container_name ?? f.container_id.slice(0, 12)}</div>
            <div className="text-muted-foreground">{f.container_id.slice(0, 12)}</div>
          </>
        ),
      },
      {
        key: 'host',
        title: '主机',
        render: (_, f) => <div className="text-foreground">{serverById.get(f.server_id)?.name ?? f.server_id}</div>,
      },
      {
        key: 'protocol',
        title: '协议',
        truncate: false,
        render: (_, f) => (
          <Badge variant="protocol" size="protocol">
            {f.protocol}
          </Badge>
        ),
      },
      {
        key: 'local',
        title: '本地端口',
        colWidth: '12rem',
        render: (_, f) =>
          f.running ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 text-foreground hover:underline"
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
            <span className="tracking-wide text-muted-foreground uppercase">random</span>
          ),
      },
      {
        key: 'target',
        title: '目标',
        render: (_, f) => (
          <>
            {f.remote_host}:{f.remote_port}
          </>
        ),
      },
      {
        key: 'status',
        title: '状态',
        render: (_, f) => (
          <div className="flex items-center gap-1.5">
            <PortForwardStatusBadge running={f.running} enabled={f.enabled} />
            {f.last_error ? (
              <span className="cursor-help text-red-500" title={f.last_error}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                  <path
                    fillRule="evenodd"
                    d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'traffic',
        title: '流量',
        colWidth: '12rem',
        render: (_, f) => (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex w-5 justify-center rounded bg-emerald-500/15 font-sans text-[10px] font-medium text-emerald-400">
                TX
              </span>
              <span>{formatBytes(f.tx_bytes)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex w-5 justify-center rounded bg-sky-500/15 font-sans text-[10px] font-medium text-sky-400">
                RX
              </span>
              <span>{formatBytes(f.rx_bytes)}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'speed',
        title: '速度',
        colWidth: '12rem',
        render: (_, f) => {
          const sp = f.running ? speeds[f.id] : undefined
          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex w-5 justify-center rounded bg-emerald-500/15 font-sans text-[10px] font-medium text-emerald-400">
                  TX
                </span>
                <span>{formatSpeed(sp?.txSpeed ?? 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex w-5 justify-center rounded bg-sky-500/15 font-sans text-[10px] font-medium text-sky-400">
                  RX
                </span>
                <span>{formatSpeed(sp?.rxSpeed ?? 0)}</span>
              </div>
            </div>
          )
        },
      },
      {
        key: 'actions',
        title: '操作',
        colWidth: '5rem',
        render: (_, f) => (
          <div>
            <Button
              type="button"
              variant="ghost"
              icon
              title={f.enabled ? '禁用' : '启用'}
              onClick={() => void handleSetEnabled(f.id, !f.enabled)}
              className={cn(
                'rounded-lg text-muted-foreground',
                f.enabled ? 'hover:bg-amber-500/10 hover:text-amber-500' : 'hover:bg-green-500/10 hover:text-green-500'
              )}
            >
              {f.enabled ? <Square /> : <Play />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              icon
              title="删除"
              onClick={() => void handleDelete(f.id)}
              className={cn('rounded-lg text-muted-foreground', 'hover:bg-red-500/10 hover:text-red-500')}
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],

    [serverById, speeds, handleSetEnabled, handleDelete]
  )

  return (
    <div className="flex h-full flex-col bg-background">
      <PageScrollArea>
        <PageListColumn gap={rules.length > 0}>
          {/* Page Header */}
          {rules.length > 0 ? (
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">端口转发</h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    管理 SSH 隧道端口转发规则，将远程容器端口映射到本地。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {runningCount > 0 ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleStopAll()}
                      disabled={rulesLoading}
                    >
                      <Square />
                      停止
                    </Button>
                  ) : enabledCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleStartAll()}
                      disabled={rulesLoading}
                    >
                      <Play />
                      启动
                    </Button>
                  ) : null}
                  <Button type="button" onClick={() => setShowCreate(true)}>
                    <Plus />
                    创建规则
                  </Button>
                </div>
              </div>

              <PanelToolbarSearch
                ref={searchRef}
                variant="page"
                value={search}
                onValueChange={setSearch}
                placeholder='搜索主机、容器、端口或错误信息… ("/" 快速聚焦)'
              />
            </div>
          ) : null}

          {/* Content */}
          <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card">
            {rulesLoading && rules.length === 0 ? (
              <PanelListLoading fullHeight />
            ) : rules.length === 0 ? (
              <EmptyState
                variant="hero"
                icon={<ArrowLeftRight />}
                title="尚未创建转发规则"
                description="创建端口转发规则，将远程容器的 TCP 端口通过 SSH 隧道映射到本地，方便本地开发与调试。"
                action={
                  <Button onClick={() => setShowCreate(true)}>
                    <Plus />
                    创建规则
                  </Button>
                }
              />
            ) : filteredRules.length === 0 ? (
              <EmptyState variant="search" className="h-48" icon={<Search />} title={`没有匹配「${search}」的规则`} />
            ) : (
              <div className="h-full overflow-auto">
                <DataTable className="w-full text-sm" rowKey="id" columns={portForwardColumns} rows={filteredRules} />
              </div>
            )}
          </div>
        </PageListColumn>
      </PageScrollArea>

      <PortForwardCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={async () => {
          await fetchRules()
          await loadServers()
        }}
      />
    </div>
  )
}
