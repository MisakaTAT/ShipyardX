import { useMemo, useState } from 'react'
import { ArrowLeftRight, Play, Plus, Search, Square } from 'lucide-react'
import type { PortForward } from '@/types/app-bindings'
import PortForwardCreateDialog from '@/features/port-forward/ui/port-forward-create-dialog'
import { Button } from '@/shared/ui/button'
import { DataTable, EmptyState, SearchInput } from '@/shared/components'
import { useServers } from '@/features/servers/api/use-servers'
import {
  useDeletePortForward,
  usePortForwardPolling,
  usePortForwards,
  useSetPortForwardEnabled,
  useStartAllPortForwards,
  useStopAllPortForwards,
} from '@/features/port-forward/api/use-port-forwards'
import { useSpeedTracker } from '@/features/port-forward/hooks/use-speed-tracker'
import { buildPortForwardColumns } from '@/features/port-forward/ui/port-forward-columns'

export default function PortForwardPage() {
  const { data: rules = [], isFetching: rulesLoading } = usePortForwards()
  const { data: servers = [] } = useServers()
  const setEnabled = useSetPortForwardEnabled()
  const remove = useDeletePortForward()
  const startAll = useStartAllPortForwards()
  const stopAll = useStopAllPortForwards()

  const speeds = useSpeedTracker(rules)

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const serverById = useMemo(() => {
    const m = new Map<string, typeof servers[number]>()
    for (const s of servers) m.set(s.id, s)
    return m
  }, [servers])

  const enabledCount = rules.filter((r) => r.enabled).length
  const runningCount = rules.filter((r) => r.running).length
  usePortForwardPolling(runningCount > 0)

  const filteredRules: PortForward[] = useMemo(() => {
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

  const columns = useMemo(
    () =>
      buildPortForwardColumns({
        serverById,
        speeds,
        onToggleEnabled: (id, enabled) => setEnabled.mutate({ id, enabled }),
        onDelete: (id) => remove.mutate(id),
      }),
    [serverById, speeds, setEnabled, remove]
  )

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-auto p-3">
        <div className={`flex h-full flex-col ${rules.length > 0 ? 'gap-3' : ''}`}>
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
                      onClick={() => stopAll.mutate()}
                      disabled={rulesLoading}
                    >
                      <Square />
                      停止
                    </Button>
                  ) : enabledCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => startAll.mutate()}
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

              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder='搜索主机、容器、端口或错误信息… ("/" 快速聚焦)'
                className="mt-4 w-full"
              />
            </div>
          ) : null}

          <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card">
            {rules.length === 0 && !rulesLoading ? (
              <div className="flex h-full items-center justify-center px-4">
                <div className="max-w-xs text-center">
                  <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-7">
                    <ArrowLeftRight />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">尚未创建转发规则</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    创建端口转发规则，将远程容器的 TCP 端口通过 SSH 隧道映射到本地，方便本地开发与调试。
                  </p>
                  <div className="mt-5">
                    <Button onClick={() => setShowCreate(true)}>
                      <Plus />
                      创建规则
                    </Button>
                  </div>
                </div>
              </div>
            ) : filteredRules.length === 0 && rules.length > 0 ? (
              <EmptyState icon={Search} title={`没有匹配「${search}」的规则`} />
            ) : (
              <DataTable<PortForward>
                columns={columns}
                data={filteredRules}
                getRowId={(r) => r.id}
                loading={rulesLoading && rules.length === 0}
                tableClassName="text-sm"
                empty={{ icon: Search, title: '没有记录' }}
              />
            )}
          </div>
        </div>
      </div>

      <PortForwardCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={async () => {
          /* 由 mutation / query 内部自动 invalidate */
        }}
      />
    </div>
  )
}
