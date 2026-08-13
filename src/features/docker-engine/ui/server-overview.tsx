import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery } from '@tanstack/react-query'
import { Box, Check, ChevronDown, Copy, Cpu, Gauge, HardDrive, Layers, Network, Server, Shield } from 'lucide-react'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toast } from '@/shared/components/toast'

interface Props {
  serverId: string
}

export default function ServerOverview({ serverId }: Props) {
  const { t } = useTranslation()
  const [warningsOpen, setWarningsOpen] = useState(false)
  const { data: info, isFetching: loading } = useQuery({
    queryKey: qk.dockerInfo(serverId),
    queryFn: () => commands.getDockerInfo(serverId),
    retry: false,
  })

  if (!info && !loading) return null

  const hasWarnings = (info?.warning_details.length ?? 0) > 0

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-3 px-0 py-0 pr-1">
        <HeroPanel
          info={info}
          loading={loading}
          warningsOpen={warningsOpen}
          onToggleWarnings={() => {
            if (!hasWarnings) return
            setWarningsOpen((prev) => !prev)
          }}
        />

        {loading && !info ? (
          <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-6 text-xs text-muted-foreground">
            <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
            {t('ui.overview.loadingHost')}
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="space-y-3">
              <SectionCard title={t('ui.overview.runtimeState')} icon={<Gauge className="size-4" />}>
                <RuntimeStatusPanel
                  running={info?.containers_running ?? '0'}
                  paused={info?.containers_paused ?? '0'}
                  stopped={info?.containers_stopped ?? '0'}
                  runningPercent={info?.containers_running_percent ?? 0}
                  pausedPercent={info?.containers_paused_percent ?? 0}
                  stoppedPercent={info?.containers_stopped_percent ?? 0}
                />
              </SectionCard>

              <SectionCard title={t('ui.overview.capabilities')} icon={<Shield className="size-4" />}>
                <CapabilityList
                  items={[
                    ['Memory Limit', info?.memory_limit ?? false],
                    ['Swap Limit', info?.swap_limit ?? false],
                    ['CPU CFS Period', info?.cpu_cfs_period ?? false],
                    ['CPU CFS Quota', info?.cpu_cfs_quota ?? false],
                    ['CPU Shares', info?.cpu_shares ?? false],
                    ['CPU Set', info?.cpu_set ?? false],
                    ['PIDs Limit', info?.pids_limit ?? false],
                    ['OOM Kill Disable', info?.oom_kill_disable ?? false],
                  ]}
                />
              </SectionCard>

              <SectionCard title={t('ui.overview.hostInfo')} icon={<Server className="size-4" />}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <KeyValueList
                    items={[
                      [t('ui.overview.os'), info?.os || '-'],
                      [t('ui.overview.osType'), info?.os_type || '-'],
                      [t('ui.overview.kernel'), info?.kernel_version || '-'],
                      [t('ui.overview.arch'), info?.architecture || '-'],
                    ]}
                  />
                  <KeyValueList
                    items={[
                      ['Docker Root Dir', info?.docker_root_dir || '-'],
                      [t('ui.overview.storageDriver'), info?.storage_driver || '-'],
                      [t('ui.overview.loggingDriver'), info?.logging_driver || '-'],
                      ['Firewall', info?.firewall_driver || '-'],
                    ]}
                  />
                </div>
                <InlineTagBlock
                  label={t('ui.overview.hostLabels')}
                  items={info?.labels ?? []}
                  empty={t('ui.overview.noLabels')}
                />
              </SectionCard>
            </div>

            <div className="space-y-3">
              <SectionCard title={t('ui.overview.engine')} icon={<Box className="size-4" />}>
                <KeyValueList
                  compact
                  columns={2}
                  items={[
                    [t('ui.overview.engineVersion'), info?.server_version || '-'],
                    [t('ui.overview.apiVersion'), info?.api_version || '-'],
                    [t('ui.overview.defaultRuntime'), info?.default_runtime || '-'],
                    ['Cgroup', joinValues(info?.cgroup_driver, info?.cgroup_version) || '-'],
                    ['Live Restore', boolText(t, info?.live_restore_enabled ?? false)],
                    ['Experimental', boolText(t, info?.experimental_build ?? false)],
                    ['Debug', boolText(t, info?.debug ?? false)],
                    ['IPv4 Forwarding', boolText(t, info?.ipv4_forwarding ?? false)],
                  ]}
                />
                <InlineTagBlock
                  compact
                  label={t('ui.overview.runtimes')}
                  items={info?.runtimes ?? []}
                  empty={t('ui.common.none')}
                />
                <InlineTagBlock
                  compact
                  label={t('ui.overview.securityOptions')}
                  items={info?.security_options ?? []}
                  empty={t('ui.common.none')}
                />
              </SectionCard>

              <SectionCard title={t('ui.overview.networkPlugins')} icon={<Network className="size-4" />}>
                <KeyValueList
                  items={[
                    ['HTTP Proxy', info?.http_proxy || '-'],
                    ['HTTPS Proxy', info?.https_proxy || '-'],
                    ['No Proxy', info?.no_proxy || '-'],
                  ]}
                />
                <InlineTagBlock
                  label={t('ui.overview.volumePlugin')}
                  items={info?.volume_plugins ?? []}
                  empty={t('ui.common.none')}
                />
                <InlineTagBlock
                  label={t('ui.overview.networkPlugin')}
                  items={info?.network_plugins ?? []}
                  empty={t('ui.common.none')}
                />
                <InlineTagBlock
                  label={t('ui.overview.authPlugin')}
                  items={info?.authorization_plugins ?? []}
                  empty={t('ui.common.none')}
                />
                <InlineTagBlock
                  label={t('ui.overview.logPlugin')}
                  items={info?.log_plugins ?? []}
                  empty={t('ui.common.none')}
                />
              </SectionCard>

              <SectionCard title={t('ui.overview.lowLevel')} icon={<Layers className="size-4" />}>
                <InlineTagBlock
                  label={t('ui.overview.storageStatus')}
                  items={info?.storage_driver_status ?? []}
                  empty={t('ui.common.none')}
                />
                <InlineTagBlock
                  label={t('ui.overview.firewallInfo')}
                  items={info?.firewall_info ?? []}
                  empty={t('ui.common.none')}
                />
              </SectionCard>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function HeroPanel({
  info,
  loading,
  warningsOpen,
  onToggleWarnings,
}: {
  info: Awaited<ReturnType<typeof commands.getDockerInfo>> | undefined
  loading: boolean
  warningsOpen: boolean
  onToggleWarnings: () => void
}) {
  const { t } = useTranslation()
  const warningCount = info?.warning_details.length ?? 0
  const statusDotClass = loading ? 'animate-pulse bg-sky-400' : warningCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${statusDotClass}`} />
            <span className="text-xs tracking-wider text-muted-foreground uppercase">Host Overview</span>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{info?.name || t('ui.overview.unknownHost')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {joinValues(info?.os || 'Unknown OS', info?.os_version, info?.architecture) || 'Unknown OS'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard
            icon={<Box className="size-4" />}
            label={t('ui.overview.containers')}
            value={info?.containers ?? '-'}
          />
          <MetricCard
            icon={<Layers className="size-4" />}
            label={t('ui.overview.images')}
            value={info?.images ?? '-'}
          />
          <MetricCard icon={<Cpu className="size-4" />} label="CPU" value={info?.ncpu ?? '-'} />
          <MetricCard
            icon={<HardDrive className="size-4" />}
            label={t('ui.overview.memory')}
            value={info?.mem_total ?? '-'}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <SummaryTile
          title={t('ui.overview.dockerVersion')}
          value={info?.server_version || '-'}
          meta={`API ${info?.api_version || '-'}`}
        />
        <SummaryTile
          title={t('ui.overview.storageRuntime')}
          value={info?.storage_driver || '-'}
          meta={
            joinValues(info?.default_runtime, joinValues(info?.cgroup_driver, info?.cgroup_version)) ||
            t('ui.overview.unidentified')
          }
        />
        <SummaryTile
          title={t('ui.overview.riskStatus')}
          value={warningCount > 0 ? t('ui.overview.hasWarnings') : t('ui.overview.stable')}
          meta={
            warningCount > 0
              ? t('ui.overview.warningCount', { count: String(warningCount) })
              : loading
                ? t('ui.overview.refreshing')
                : t('ui.overview.noNotices')
          }
          tone={warningCount > 0 ? 'warning' : 'normal'}
          interactive={warningCount > 0}
          expanded={warningsOpen}
          onClick={onToggleWarnings}
        />
      </div>

      {warningCount > 0 && warningsOpen ? <WarningInlineList warnings={info?.warning_details ?? []} /> : null}
    </div>
  )
}

function SectionCard({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0 text-sm font-medium text-foreground">{title}</div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
    </div>
  )
}

function SummaryTile({
  title,
  value,
  meta,
  tone = 'normal',
  interactive = false,
  expanded = false,
  onClick,
}: {
  title: string
  value: string
  meta: string
  tone?: 'normal' | 'warning'
  interactive?: boolean
  expanded?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{title}</div>
        {interactive ? (
          <ChevronDown
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        ) : null}
      </div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
    </>
  )

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      className={`rounded-lg border px-3 py-3 text-left ${tone === 'warning' ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-background'} ${
        interactive ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      {content}
    </button>
  )
}

function RuntimeStatusPanel({
  running,
  paused,
  stopped,
  runningPercent,
  pausedPercent,
  stoppedPercent,
}: {
  running: string
  paused: string
  stopped: string
  runningPercent: number
  pausedPercent: number
  stoppedPercent: number
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
      <RuntimeStateItem label={t('ui.overview.running')} value={running} percent={runningPercent} tone="green" />
      <RuntimeStateItem label={t('ui.overview.paused')} value={paused} percent={pausedPercent} tone="amber" />
      <RuntimeStateItem label={t('ui.overview.stopped')} value={stopped} percent={stoppedPercent} tone="slate" />
    </div>
  )
}

function RuntimeStateItem({
  label,
  value,
  percent,
  tone,
}: {
  label: string
  value: string
  percent: number
  tone: 'green' | 'amber' | 'slate'
}) {
  const toneClass = tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-slate-400'

  return (
    <div className="min-w-0 py-1 md:px-4 md:py-0 first:md:pl-0 last:md:pr-0">
      <div className="flex items-end justify-center gap-2">
        <div className="text-[1.9rem] leading-none font-semibold text-foreground">{value}</div>
        <div className="pb-0.5 text-xs text-muted-foreground">{Math.round(percent)}%</div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <span className={`h-2 w-2 rounded-full ${toneClass}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

function KeyValueList({
  items,
  highlightKeys,
  highlightWhen,
  compact = false,
  columns = 1,
}: {
  items: Array<[string, string]>
  highlightKeys?: Set<string>
  highlightWhen?: (label: string, value: string) => boolean
  compact?: boolean
  columns?: 1 | 2
}) {
  return (
    <div
      className={
        columns === 2
          ? compact
            ? 'grid gap-1.5 md:grid-cols-2'
            : 'grid gap-2 md:grid-cols-2'
          : compact
            ? 'space-y-1.5'
            : 'space-y-2'
      }
    >
      {items.map(([label, value]) => {
        const highlight = highlightKeys?.has(label) && (highlightWhen ? highlightWhen(label, value) : true)
        return (
          <div
            key={label}
            className={`flex items-start justify-between gap-4 rounded-lg border border-border bg-background text-xs ${
              compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
            }`}
          >
            <span className="text-muted-foreground">{label}</span>
            <span
              className={`max-w-[60%] text-right font-medium break-all ${highlight ? 'text-amber-500' : 'text-foreground'}`}
            >
              {value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CapabilityList({ items }: { items: Array<[string, boolean]> }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {items.map(([label, enabled]) => (
        <div
          key={label}
          className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 ${
            enabled ? 'border-emerald-500/20 bg-emerald-500/8' : 'border-border bg-background'
          }`}
        >
          <div className="min-w-0 text-xs text-muted-foreground">{label}</div>
          <div
            className={`shrink-0 text-xs font-medium ${enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}
          >
            {enabled ? t('ui.common.enabled') : t('ui.common.notEnabled')}
          </div>
        </div>
      ))}
    </div>
  )
}

function InlineTagBlock({
  label,
  items,
  empty,
  compact = false,
}: {
  label: string
  items: string[]
  empty: string
  compact?: boolean
}) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {items.length ? (
        <div className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}>
          {items.map((item) => (
            <span
              key={item}
              className={`rounded-full border border-border bg-background text-xs text-foreground ${
                compact ? 'px-2 py-0.5' : 'px-2.5 py-1'
              }`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div
          className={`rounded-lg border border-dashed border-border text-xs text-muted-foreground ${compact ? 'px-2.5 py-2' : 'px-3 py-3'}`}
        >
          {empty}
        </div>
      )}
    </div>
  )
}

function WarningInlineList({ warnings }: { warnings: string[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(warnings.join('\n')).then(() => {
      setCopied(true)
      toast.success(t('ui.overview.warningsCopied'))
      setTimeout(() => setCopied(false), 1500)
    })
  }, [warnings, t])

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="space-y-2">
        {warnings.map((warning, index) => (
          <div key={`${index}-${warning}`} className="border-l-2 border-amber-500/40 pl-3">
            <div className="flex items-start gap-3">
              <div className="flex w-8 shrink-0 flex-col items-center gap-1">
                <span className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {index === 0 ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    onClick={handleCopy}
                    title={t('ui.overview.copyWarnings')}
                  >
                    {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                  </button>
                ) : null}
              </div>
              <p className="text-xs leading-5 text-foreground">{warning}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function joinValues(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(' / ')
}

function boolText(t: TFunction, value: boolean) {
  return value ? t('ui.common.enabled') : t('ui.common.notEnabled')
}
