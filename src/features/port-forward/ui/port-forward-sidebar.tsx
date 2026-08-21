import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Layers, Server } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { HostGroup } from '@/features/port-forward/model/group-forwards'
import { containerLabel, isSameScope, type ForwardScope } from '@/features/port-forward/model/port-forward-scope'
import { aggregateState } from '@/features/port-forward/model/forward-state'
import { StatusDot } from '@/features/port-forward/ui/port-forward-status'

interface PortForwardSidebarProps {
  groups: HostGroup[]
  totalCount: number
  scope: ForwardScope
  onScopeChange: (scope: ForwardScope) => void
}

interface ScopeItemProps {
  active: boolean
  icon: ReactNode
  label: string
  title?: string
  count: number
  indent: string
  leading?: ReactNode
  onSelect: () => void
}

function ScopeItem({ active, icon, label, title, count, indent, leading, onSelect }: ScopeItemProps) {
  return (
    <div
      className={cn(
        'flex h-8 items-center rounded-lg pr-2 transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      {leading}
      <button
        type="button"
        title={title}
        aria-current={active ? 'true' : undefined}
        onClick={onSelect}
        className={cn('flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-left', indent)}
      >
        <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">{icon}</span>
        <span className={cn('min-w-0 flex-1 truncate text-[13px]', active && 'font-medium')}>{label}</span>
      </button>
      <span className="shrink-0 pl-1 text-[11px] tabular-nums opacity-60">{count}</span>
    </div>
  )
}

export function PortForwardSidebar({ groups, totalCount, scope, onScopeChange }: PortForwardSidebarProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapsed = useCallback(
    (host: HostGroup) => {
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(host.key)) {
          next.delete(host.key)
          return next
        }
        next.add(host.key)
        if (host.containers.some((container) => isSameScope(scope, { kind: 'container', key: container.key }))) {
          onScopeChange({ kind: 'host', key: host.key })
        }
        return next
      })
    },
    [scope, onScopeChange]
  )

  return (
    <nav
      aria-label={t('ui.portForward.scopeNav')}
      className="flex w-52 shrink-0 flex-col overflow-y-auto rounded-xl border border-border bg-card p-2"
    >
      <ScopeItem
        active={scope.kind === 'all'}
        icon={<Layers />}
        label={t('ui.portForward.allRules')}
        count={totalCount}
        indent="pl-5"
        onSelect={() => onScopeChange({ kind: 'all' })}
      />

      {groups.map((host) => {
        const isCollapsed = collapsed.has(host.key)
        return (
          <div key={host.key} className="flex flex-col">
            <ScopeItem
              active={isSameScope(scope, { kind: 'host', key: host.key })}
              icon={<Server />}
              label={host.serverName}
              title={host.serverHost ?? host.serverName}
              count={host.ruleCount}
              indent="pl-0"
              leading={
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-label={host.serverName}
                  onClick={() => toggleCollapsed(host)}
                  className="flex h-full w-5 shrink-0 cursor-pointer items-center justify-center"
                >
                  <ChevronRight
                    className={cn('size-3.5 transition-transform', !isCollapsed && 'rotate-90')}
                    aria-hidden
                  />
                </button>
              }
              onSelect={() => onScopeChange({ kind: 'host', key: host.key })}
            />

            {isCollapsed
              ? null
              : host.containers.map((container) => (
                  <ScopeItem
                    key={container.key}
                    active={isSameScope(scope, { kind: 'container', key: container.key })}
                    icon={<StatusDot state={aggregateState(container.rules)} />}
                    label={containerLabel(container)}
                    title={container.containerId}
                    count={container.rules.length}
                    indent="pl-8"
                    onSelect={() => onScopeChange({ kind: 'container', key: container.key })}
                  />
                ))}
          </div>
        )
      })}
    </nav>
  )
}
