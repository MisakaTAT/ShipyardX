import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Fingerprint, Loader2, MoreHorizontal, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { KnownHostEntry, ServerConfig } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ConfirmDialog, EmptyState, toast } from '@/shared/components'
import { ActiveFilterChip } from '@/shared/components/active-filter-chip'
import { usePageQuery } from '@/shared/hooks/use-page-query'
import { APP_PATHS } from '@/shared/lib/app-router'
import { cn } from '@/shared/lib/utils'
import { useServers } from '@/features/servers/api/use-servers'
import {
  useClearKnownHosts,
  useForgetHostKey,
  useForgetHostKeys,
  useHostKeyProbe,
  useKnownHosts,
  useTrustHostKey,
} from '@/features/host-keys/api/use-host-keys'
import { hostKeyId, matchServers } from '@/features/host-keys/model/host-key'
import { HostKeyCard } from '@/features/host-keys/ui/host-key-card'
import HostKeyAddDialog from '@/features/host-keys/ui/host-key-add-dialog'

interface Row {
  entry: KnownHostEntry
  servers: ServerConfig[]
}

function OrphanGroup({
  count,
  expanded,
  onToggle,
  onClear,
  children,
}: {
  count: number
  expanded: boolean
  onToggle: () => void
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3.5 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
          />
          <span className="truncate text-[13px] text-muted-foreground">{count} 条指纹没有对应的服务器配置</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          onClick={onClear}
        >
          <Trash2 />
          清理
        </Button>
      </div>
      {expanded ? <div className="space-y-2">{children}</div> : null}
    </div>
  )
}

export default function HostKeysPage() {
  const { data: entries = [], isFetching } = useKnownHosts()
  const { data: servers = [] } = useServers()
  const forget = useForgetHostKey()
  const forgetMany = useForgetHostKeys()
  const clear = useClearKnownHosts()
  const trust = useTrustHostKey()
  const { results, probe, clear: clearProbe } = useHostKeyProbe()

  const [showAdd, setShowAdd] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<KnownHostEntry | null>(null)
  const [showClearAll, setShowClearAll] = useState(false)
  const [showClearOrphans, setShowClearOrphans] = useState(false)
  const [orphansOpen, setOrphansOpen] = useState(false)
  const [probingAll, setProbingAll] = useState(false)

  const openAdd = useCallback(() => setShowAdd(true), [])
  const { query: search, clearQuery } = usePageQuery(APP_PATHS.hostKeys, openAdd)

  const rows: Row[] = useMemo(
    () => entries.map((entry) => ({ entry, servers: matchServers(entry, servers) })),
    [entries, servers]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(({ entry, servers: matched }) =>
      `${entry.host}:${entry.port} ${entry.fingerprint} ${matched.map((s) => s.name).join(' ')}`
        .toLowerCase()
        .includes(q)
    )
  }, [rows, search])

  const linked = filtered.filter((row) => row.servers.length > 0)
  const orphans = filtered.filter((row) => row.servers.length === 0)
  // 搜索只命中残留项时强制展开，否则整页只剩一条折叠带，像是什么都没搜到
  const orphansExpanded = orphansOpen || linked.length === 0

  // 串行探测：每条都是一次真实 SSH 握手，并发会同时打满所有服务器
  const probeAll = useCallback(async () => {
    setProbingAll(true)
    try {
      for (const { entry } of filtered) await probe(entry)
    } finally {
      setProbingAll(false)
    }
  }, [filtered, probe])

  const handleCopy = useCallback((fingerprint: string) => {
    void navigator.clipboard.writeText(fingerprint).then(() => {
      toast.success('指纹已复制')
    })
  }, [])

  const handleTrust = useCallback(
    (entry: KnownHostEntry, fingerprint: string) => {
      trust.mutate(
        { host: entry.host, port: entry.port, fingerprint },
        { onSuccess: () => clearProbe(hostKeyId(entry.host, entry.port)) }
      )
    },
    [trust, clearProbe]
  )

  const renderCard = ({ entry, servers: matched }: Row) => (
    <HostKeyCard
      key={hostKeyId(entry.host, entry.port)}
      entry={entry}
      servers={matched}
      state={results[hostKeyId(entry.host, entry.port)]}
      probeDisabled={probingAll}
      onProbe={() => void probe(entry)}
      onCopy={() => handleCopy(entry.fingerprint)}
      onTrust={(fingerprint) => handleTrust(entry, fingerprint)}
      onDelete={() => setPendingDelete(entry)}
    />
  )

  if (isFetching && entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-auto p-3">
        <div className={`flex h-full flex-col ${entries.length > 0 ? 'gap-3' : ''}`}>
          {entries.length > 0 ? (
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">主机指纹</h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    管理已信任的 SSH 主机密钥，指纹变化时会中断连接并要求重新确认。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="text-muted-foreground"
                          title="更多操作"
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem disabled={probingAll} onClick={() => void probeAll()}>
                        <RefreshCw className={cn('size-3.5', probingAll && 'animate-spin')} />
                        检测全部
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setShowClearAll(true)}>
                        <Trash2 className="size-3.5" />
                        清空全部
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button type="button" onClick={() => setShowAdd(true)}>
                    <Plus />
                    添加指纹
                  </Button>
                </div>
              </div>

              {search ? <ActiveFilterChip query={search} count={filtered.length} onClear={clearQuery} /> : null}
            </div>
          ) : null}

          <div className="flex-1 overflow-auto">
            {entries.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4">
                <div className="max-w-xs text-center">
                  <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-7">
                    <Fingerprint />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">还没有已信任的主机</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    首次连接服务器时会显示指纹并请你确认，确认后会记录在这里。你也可以先手动录入从服务器上抄来的指纹。
                  </p>
                  <div className="mt-5">
                    <Button onClick={() => setShowAdd(true)}>
                      <Plus />
                      添加指纹
                    </Button>
                  </div>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={Search} title={`没有匹配「${search}」的指纹`} />
            ) : (
              <div className="flex flex-col gap-4">
                {orphans.length > 0 ? (
                  <OrphanGroup
                    count={orphans.length}
                    expanded={orphansExpanded}
                    onToggle={() => setOrphansOpen((open) => !open)}
                    onClear={() => setShowClearOrphans(true)}
                  >
                    {orphans.map(renderCard)}
                  </OrphanGroup>
                ) : null}

                {!orphansExpanded && linked.length > 0 ? (
                  <div className="space-y-2">{linked.map(renderCard)}</div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <HostKeyAddDialog open={showAdd} onOpenChange={setShowAdd} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="删除指纹"
        description={
          pendingDelete
            ? `删除 ${pendingDelete.host}:${pendingDelete.port} 的指纹后，下次连接该主机时需要重新确认。`
            : ''
        }
        destructive
        confirmText="删除"
        onConfirm={() => {
          if (!pendingDelete) return
          forget.mutate({ host: pendingDelete.host, port: pendingDelete.port })
        }}
      />

      <ConfirmDialog
        open={showClearOrphans}
        onOpenChange={setShowClearOrphans}
        title="清理无关联指纹"
        description={`将删除 ${orphans.length} 条没有对应服务器配置的指纹。已关联服务器的记录不受影响。`}
        destructive
        confirmText="清理"
        onConfirm={() => forgetMany.mutate(orphans.map(({ entry }) => ({ host: entry.host, port: entry.port })))}
      />

      <ConfirmDialog
        open={showClearAll}
        onOpenChange={setShowClearAll}
        title="清空全部指纹"
        description={`将删除全部 ${entries.length} 条已信任指纹，包含已关联服务器的那些。所有主机下次连接时都需要重新确认，此操作不可撤销。`}
        destructive
        confirmText="清空"
        onConfirm={() => clear.mutate()}
      />
    </div>
  )
}
