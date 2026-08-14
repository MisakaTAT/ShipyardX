import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Loader2, Play, Plus, Search, Square } from 'lucide-react'
import PortForwardCreateDialog from '@/features/port-forward/ui/port-forward-create-dialog'
import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/components'
import { ActiveFilterChip } from '@/shared/components/active-filter-chip'
import { usePageQuery } from '@/shared/hooks/use-page-query'
import { APP_PATHS } from '@/shared/lib/app-router'
import { resolveAppError } from '@/shared/lib/errors'
import { useServers } from '@/features/servers/api/use-servers'
import {
  useDeletePortForward,
  usePortForwardPolling,
  usePortForwards,
  useRetryPortForward,
  useSetPortForwardEnabled,
  useSetPortForwardsEnabled,
  useStartAllPortForwards,
  useStopAllPortForwards,
} from '@/features/port-forward/api/use-port-forwards'
import { CommandPaletteButton } from '@/features/command-palette/ui/command-palette-button'
import { groupForwards } from '@/features/port-forward/model/group-forwards'
import { PortForwardHostGroup } from '@/features/port-forward/ui/port-forward-host-group'

const AUTO_COLLAPSE_THRESHOLD = 60

export default function PortForwardPage() {
  const { t } = useTranslation()
  const { data: rules = [], isLoading } = usePortForwards()
  const { data: servers = [] } = useServers()
  const setEnabled = useSetPortForwardEnabled()
  const setManyEnabled = useSetPortForwardsEnabled()
  const remove = useDeletePortForward()
  const startAll = useStartAllPortForwards()
  const stopAll = useStopAllPortForwards()
  const retry = useRetryPortForward()

  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const openCreate = useCallback(() => setShowCreate(true), [])
  const { query: search, clearQuery } = usePageQuery(APP_PATHS.portForward, openCreate)

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers])

  const enabledCount = rules.filter((r) => r.enabled).length
  const runningCount = rules.filter((r) => r.running).length
  usePortForwardPolling(runningCount > 0)

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rules
    return rules.filter((r) => {
      const server = serverById.get(r.server_id)
      const haystack = [
        server?.name ?? '',
        server?.host ?? '',
        r.server_id,
        `${r.remote_host}:${r.remote_port}`,
        String(r.local_port),
        r.container_id,
        r.container_name ?? '',
        r.last_error ? resolveAppError(r.last_error).message : '',
      ]
      return haystack.some((field) => field.toLowerCase().includes(q))
    })
  }, [rules, search, serverById])

  const groups = useMemo(() => groupForwards(filteredRules, serverById), [filteredRules, serverById])

  const autoCollapse = !search.trim() && filteredRules.length > AUTO_COLLAPSE_THRESHOLD
  const isCollapsed = useCallback(
    (key: string) => (autoCollapse ? !expanded.has(key) : collapsed.has(key)),
    [autoCollapse, expanded, collapsed]
  )

  const toggleCollapsed = useCallback(
    (key: string) => {
      const flip = (prev: Set<string>) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }
      if (autoCollapse) setExpanded(flip)
      else setCollapsed(flip)
    },
    [autoCollapse]
  )

  const handlers = useMemo(
    () => ({
      onToggleEnabled: (id: string, enabled: boolean) => setEnabled.mutate({ id, enabled }),
      onBulkEnabled: (ids: string[], enabled: boolean) => setManyEnabled.mutate({ ids, enabled }),
      onDelete: (id: string) => remove.mutate(id),
      onRetry: (id: string) => retry.mutate(id),
      retryingId: retry.isPending ? retry.variables : undefined,
    }),
    [setEnabled, setManyEnabled, remove, retry]
  )

  if (isLoading && rules.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (rules.length === 0) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex h-full flex-1 items-center justify-center px-4">
          <div className="max-w-xs text-center">
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-7">
              <ArrowLeftRight />
            </div>
            <h2 className="text-sm font-semibold text-foreground">{t('ui.portForward.emptyTitle')}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('ui.portForward.emptyBody')}</p>
            <div className="mt-5">
              <Button onClick={openCreate}>
                <Plus />
                {t('ui.portForward.create')}
              </Button>
            </div>
          </div>
        </div>
        <PortForwardCreateDialog open={showCreate} onOpenChange={setShowCreate} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-auto p-3">
        <div className="flex flex-col gap-3">
          <div className="shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-foreground">{t('ui.portForward.title')}</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('ui.portForward.summary', {
                    hosts: groups.length,
                    running: runningCount,
                    total: rules.length,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CommandPaletteButton />
                {runningCount > 0 ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => stopAll.mutate()}
                    disabled={stopAll.isPending}
                  >
                    <Square />
                    {t('ui.portForward.stop')}
                  </Button>
                ) : enabledCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startAll.mutate()}
                    disabled={startAll.isPending}
                  >
                    <Play />
                    {t('ui.portForward.start')}
                  </Button>
                ) : null}
                <Button type="button" onClick={openCreate}>
                  <Plus />
                  {t('ui.portForward.create')}
                </Button>
              </div>
            </div>

            {search ? <ActiveFilterChip query={search} count={filteredRules.length} onClear={clearQuery} /> : null}
          </div>

          {groups.length === 0 ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <EmptyState icon={Search} title={t('ui.portForward.noMatch', { query: search })} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((group) => (
                <PortForwardHostGroup
                  key={group.key}
                  group={group}
                  collapsed={isCollapsed(group.key)}
                  onToggleCollapsed={toggleCollapsed}
                  {...handlers}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <PortForwardCreateDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  )
}
