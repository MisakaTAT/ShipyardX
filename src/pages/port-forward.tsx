import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Loader2, Play, Plus, Square } from 'lucide-react'
import PortForwardCreateDialog from '@/features/port-forward/ui/port-forward-create-dialog'
import { Button } from '@/shared/ui/button'
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
import {
  ALL_SCOPE,
  buildSections,
  resolveScope,
  summarizeRules,
  type ForwardScope,
} from '@/features/port-forward/model/port-forward-scope'
import { PortForwardSidebar } from '@/features/port-forward/ui/port-forward-sidebar'
import { PortForwardDetail } from '@/features/port-forward/ui/port-forward-detail'

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
  const [scope, setScope] = useState<ForwardScope>(ALL_SCOPE)

  const openCreate = useCallback(() => setShowCreate(true), [])
  const { query: search, clearQuery } = usePageQuery(APP_PATHS.portForward, openCreate)

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers])

  const enabledCount = rules.filter((rule) => rule.enabled).length
  const runningCount = rules.filter((rule) => rule.running).length
  usePortForwardPolling(runningCount > 0)

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rules
    return rules.filter((rule) => {
      const server = serverById.get(rule.server_id)
      const haystack = [
        server?.name ?? '',
        server?.host ?? '',
        rule.server_id,
        `${rule.remote_host}:${rule.remote_port}`,
        String(rule.local_port),
        rule.container_id,
        rule.container_name ?? '',
        rule.last_error ? resolveAppError(rule.last_error).message : '',
      ]
      return haystack.some((field) => field.toLowerCase().includes(q))
    })
  }, [rules, search, serverById])

  const groups = useMemo(() => groupForwards(filteredRules, serverById), [filteredRules, serverById])
  const resolved = useMemo(() => resolveScope(groups, scope), [groups, scope])
  const sections = useMemo(() => buildSections(groups, scope), [groups, scope])
  const summary = useMemo(() => summarizeRules(resolved.rules), [resolved.rules])

  useEffect(() => {
    if (!resolved.found) setScope(ALL_SCOPE)
  }, [resolved.found])

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
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="shrink-0">
          <div className="flex h-8 items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">{t('ui.portForward.title')}</h1>
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
                <Button type="button" variant="outline" onClick={() => startAll.mutate()} disabled={startAll.isPending}>
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

        <div className="flex min-h-0 flex-1 gap-3">
          <PortForwardSidebar
            groups={groups}
            totalCount={filteredRules.length}
            scope={scope}
            onScopeChange={setScope}
          />

          <PortForwardDetail scope={scope} summary={summary} sections={sections} search={search} {...handlers} />
        </div>
      </div>

      <PortForwardCreateDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  )
}
