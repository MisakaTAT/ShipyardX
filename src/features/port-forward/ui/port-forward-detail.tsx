import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Play, Search, Server, Square } from 'lucide-react'
import type { PortForward } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/components'
import { cn } from '@/shared/lib/utils'
import { splitSpeed } from '@/features/port-forward/model/group-forwards'
import {
  scopeKey,
  type ForwardScope,
  type RuleSection,
  type ScopeSummary,
} from '@/features/port-forward/model/port-forward-scope'
import { useTrafficHistory } from '@/features/port-forward/lib/use-traffic-history'
import { PortForwardTrafficChart } from '@/features/port-forward/ui/port-forward-traffic-chart'
import { PortForwardRuleRow } from '@/features/port-forward/ui/port-forward-rule-row'

export interface PortForwardDetailProps {
  scope: ForwardScope
  summary: ScopeSummary
  sections: RuleSection[]
  search: string
  onToggleEnabled: (id: string, enabled: boolean) => void
  onBulkEnabled: (ids: string[], enabled: boolean) => void
  onDelete: (id: string) => void
  onRetry: (id: string) => void
  retryingId?: string
}

function StatTile({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 flex items-baseline gap-1 font-mono text-lg leading-tight tabular-nums', tone)}>
        {value}
        {unit ? <span className="font-sans text-[11px] font-normal opacity-70">{unit}</span> : null}
      </div>
    </div>
  )
}

function BulkButton({
  rules,
  onBulkEnabled,
  className,
}: {
  rules: PortForward[]
  onBulkEnabled: (ids: string[], enabled: boolean) => void
  className?: string
}) {
  const { t } = useTranslation()
  const disableMode = rules.some((rule) => rule.enabled)

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={cn('text-muted-foreground [&_svg]:-translate-y-[0.5px]', className)}
      disabled={rules.length === 0}
      onClick={() =>
        onBulkEnabled(
          rules.map((rule) => rule.id),
          !disableMode
        )
      }
    >
      {disableMode ? <Square /> : <Play />}
      {t(disableMode ? 'ui.portForward.disableAll' : 'ui.portForward.enableAll')}
    </Button>
  )
}

function SectionHeader({
  icon,
  label,
  sublabel,
  rules,
  onBulkEnabled,
}: {
  icon: ReactNode
  label: string
  sublabel: string | null
  rules: PortForward[]
  onBulkEnabled: (ids: string[], enabled: boolean) => void
}) {
  return (
    <div className="flex h-8 items-center gap-2 border-b border-border bg-muted/40 px-3">
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="truncate text-xs font-medium text-foreground" title={label}>
        {label}
      </span>
      {sublabel ? <span className="shrink-0 font-mono text-xs text-muted-foreground/70">{sublabel}</span> : null}
      <BulkButton rules={rules} onBulkEnabled={onBulkEnabled} className="ml-auto" />
    </div>
  )
}

export function PortForwardDetail({
  scope,
  summary,
  sections,
  search,
  onToggleEnabled,
  onBulkEnabled,
  onDelete,
  onRetry,
  retryingId,
}: PortForwardDetailProps) {
  const { t } = useTranslation()
  const samples = useTrafficHistory(summary.tx, summary.rx, scopeKey(scope))

  const tx = splitSpeed(summary.tx)
  const rx = splitSpeed(summary.rx)
  const isAll = scope.kind === 'all'

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
      {summary.total > 0 ? (
        <>
          <div className={cn('grid grid-cols-2 gap-2', summary.failed > 0 ? 'md:grid-cols-4' : 'sm:grid-cols-3')}>
            <StatTile
              label={t('ui.portForward.kpiRunning')}
              value={`${summary.running}/${summary.total}`}
              tone={summary.running > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined}
            />
            <StatTile label={t('ui.portForward.kpiTx')} value={tx.value} unit={tx.unit} />
            <StatTile label={t('ui.portForward.kpiRx')} value={rx.value} unit={rx.unit} />
            {summary.failed > 0 ? (
              <StatTile label={t('ui.portForward.kpiFailed')} value={String(summary.failed)} tone="text-destructive" />
            ) : null}
          </div>

          <PortForwardTrafficChart samples={samples} />

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {sections.map((section, index) => (
              <Fragment key={section.key}>
                <div className={cn(index > 0 && 'border-t border-border')}>
                  <SectionHeader
                    icon={isAll ? <Server /> : <Box />}
                    label={section.label}
                    sublabel={section.sublabel}
                    rules={section.rules}
                    onBulkEnabled={onBulkEnabled}
                  />
                </div>

                {section.rules.map((rule, ruleIndex) => (
                  <div key={rule.id} className={cn(ruleIndex > 0 && 'border-t border-border/60')}>
                    <PortForwardRuleRow
                      rule={rule}
                      onToggleEnabled={onToggleEnabled}
                      onDelete={onDelete}
                      onRetry={onRetry}
                      retrying={retryingId === rule.id}
                      showContainer={isAll}
                    />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <EmptyState
            icon={Search}
            title={search ? t('ui.portForward.noMatch', { query: search }) : t('ui.portForward.scopeEmpty')}
          />
        </div>
      )}
    </div>
  )
}
