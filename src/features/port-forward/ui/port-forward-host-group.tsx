import { useTranslation } from 'react-i18next'
import { Box, ChevronRight, Play, Server, Square } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { collectRuleIds, type ContainerGroup, type HostGroup } from '@/features/port-forward/model/group-forwards'
import { PortForwardRuleRow } from '@/features/port-forward/ui/port-forward-rule-row'

interface PortForwardHostGroupProps {
  group: HostGroup
  collapsed: boolean
  onToggleCollapsed: (key: string) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
  onBulkEnabled: (ids: string[], enabled: boolean) => void
  onDelete: (id: string) => void
  onRetry: (id: string) => void
  retryingId?: string
}

function BulkToggle({
  enabledCount,
  total,
  onBulk,
  ids,
  label,
  className,
}: {
  enabledCount: number
  total: number
  ids: string[]
  onBulk: (ids: string[], enabled: boolean) => void
  label: { enable: string; disable: string }
  className?: string
}) {
  const disableMode = enabledCount > 0
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={disableMode ? label.disable : label.enable}
      onClick={() => onBulk(ids, !disableMode)}
      className={cn(
        'size-6 text-muted-foreground',
        disableMode ? 'hover:bg-amber-500/10 hover:text-amber-500' : 'hover:bg-green-500/10 hover:text-green-500',
        className
      )}
      disabled={total === 0}
    >
      {disableMode ? <Square /> : <Play />}
    </Button>
  )
}

function ContainerBlock({
  container,
  ...handlers
}: { container: ContainerGroup } & Pick<
  PortForwardHostGroupProps,
  'onToggleEnabled' | 'onBulkEnabled' | 'onDelete' | 'onRetry' | 'retryingId'
>) {
  const { t } = useTranslation()
  const { onToggleEnabled, onBulkEnabled, onDelete, onRetry, retryingId } = handlers

  return (
    <div>
      <div className="group/container flex h-7 items-center gap-1.5 border-t border-border/60 bg-muted/20 pr-1.5 pl-6">
        <Box className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-xs font-medium text-foreground">
          {container.containerName ?? container.containerId.slice(0, 12)}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
          {container.containerId.slice(0, 12)}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <BulkToggle
            enabledCount={container.enabledCount}
            total={container.rules.length}
            ids={collectRuleIds(container)}
            onBulk={onBulkEnabled}
            label={{ enable: t('ui.portForward.enableContainer'), disable: t('ui.portForward.disableContainer') }}
            className="opacity-0 transition-opacity group-focus-within/container:opacity-100 group-hover/container:opacity-100 focus:opacity-100"
          />
        </span>
      </div>

      {container.rules.map((rule) => (
        <PortForwardRuleRow
          key={rule.id}
          rule={rule}
          onToggleEnabled={onToggleEnabled}
          onDelete={onDelete}
          onRetry={onRetry}
          retrying={retryingId === rule.id}
        />
      ))}
    </div>
  )
}

export function PortForwardHostGroup({ group, collapsed, onToggleCollapsed, ...handlers }: PortForwardHostGroupProps) {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="group/host flex h-9 items-center gap-1.5 pr-1.5 pl-2 hover:bg-muted/40">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapsed(group.key)}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !collapsed && 'rotate-90')}
            aria-hidden
          />
          <Server className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium text-foreground">{group.serverName}</span>
          {group.serverHost ? (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{group.serverHost}</span>
          ) : null}
        </button>

        <BulkToggle
          enabledCount={group.enabledCount}
          total={group.ruleCount}
          ids={collectRuleIds(group)}
          onBulk={handlers.onBulkEnabled}
          label={{ enable: t('ui.portForward.enableHost'), disable: t('ui.portForward.disableHost') }}
          className="opacity-0 transition-opacity group-focus-within/host:opacity-100 group-hover/host:opacity-100 focus:opacity-100"
        />
      </div>

      {collapsed
        ? null
        : group.containers.map((container) => (
            <ContainerBlock key={container.key} container={container} {...handlers} />
          ))}
    </div>
  )
}
