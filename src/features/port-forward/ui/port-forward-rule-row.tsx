import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Play, Square, Trash2 } from 'lucide-react'
import type { PortForward } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { ToneBadge } from '@/shared/components/tone-badge'
import type { BadgeTone } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'
import { formatSpeed } from '@/features/port-forward/model/group-forwards'
import { PortForwardErrorPopover } from '@/features/port-forward/ui/port-forward-error-popover'

interface PortForwardRuleRowProps {
  rule: PortForward
  onToggleEnabled: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onRetry: (id: string) => void
  retrying?: boolean
}

function statusDot(rule: PortForward) {
  if (rule.running) return { className: 'bg-emerald-500', label: 'ui.portForward.statusListening' } as const
  if (rule.enabled) return { className: 'bg-amber-500', label: 'ui.portForward.statusPending' } as const
  return { className: 'bg-muted-foreground/40', label: 'ui.portForward.statusDisabled' } as const
}

function targetTitle(rule: PortForward) {
  return `${rule.remote_host}:${rule.remote_port}/${rule.protocol}`
}

const PROTOCOL_TONE: Record<string, BadgeTone> = { tcp: 'info', udp: 'pending' }

export function PortForwardRuleRow({ rule, onToggleEnabled, onDelete, onRetry, retrying }: PortForwardRuleRowProps) {
  const { t } = useTranslation()
  const local = rule.local_port > 0 ? `${rule.bind_address}:${rule.local_port}` : null
  const status = statusDot(rule)

  return (
    <div className="group relative flex h-9 items-center gap-1.5 border-t border-border/60 pr-1.5 pl-10 hover:bg-muted/40">
      {rule.last_error ? (
        <PortForwardErrorPopover
          failure={rule.last_error}
          retrying={retrying}
          onRetry={() => onRetry(rule.id)}
          triggerClassName="top-0 left-0 z-10"
        />
      ) : null}
      <span className={cn('size-1.5 shrink-0 rounded-full', status.className)} title={t(status.label)}>
        <span className="sr-only">{t(status.label)}</span>
      </span>

      <div className="w-[21ch] shrink-0 truncate font-mono text-xs" title={local ?? undefined}>
        {local == null ? (
          <span className="tracking-wide text-muted-foreground uppercase">random</span>
        ) : rule.running ? (
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            title={t('ui.portForward.openLocal', { address: local })}
            onClick={() => void openUrl(`http://${local}`)}
          >
            {local}
          </button>
        ) : (
          <span className="text-muted-foreground">{local}</span>
        )}
      </div>

      <span className="shrink-0 -translate-y-px font-mono text-xs leading-none text-muted-foreground/70" aria-hidden>
        &rsaquo;
      </span>

      <div className="w-[6ch] shrink-0 font-mono text-xs text-foreground/80" title={targetTitle(rule)}>
        :{rule.remote_port}
      </div>

      <div className="flex w-10 shrink-0 items-center">
        <ToneBadge
          tone={PROTOCOL_TONE[rule.protocol.toLowerCase()] ?? 'muted'}
          className="h-4 px-1.5 py-0 text-[10px] leading-none tracking-wide uppercase"
        >
          {rule.protocol}
        </ToneBadge>
      </div>

      <div className="hidden w-36 shrink-0 font-mono text-[11px] leading-tight sm:flex sm:flex-col sm:justify-center">
        {rule.running ? (
          <>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-600 dark:text-emerald-400">
              <span className="inline-flex w-5 justify-center rounded bg-emerald-500/15 font-sans text-[10px] font-medium">
                TX
              </span>
              {formatSpeed(rule.tx_speed_bps)}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-sky-600 dark:text-sky-400">
              <span className="inline-flex w-5 justify-center rounded bg-sky-500/15 font-sans text-[10px] font-medium">
                RX
              </span>
              {formatSpeed(rule.rx_speed_bps)}
            </span>
          </>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={rule.enabled ? t('ui.portForward.disable') : t('ui.portForward.enable')}
          onClick={() => onToggleEnabled(rule.id, !rule.enabled)}
          className={cn(
            'size-6 text-muted-foreground',
            rule.enabled ? 'hover:bg-amber-500/10 hover:text-amber-500' : 'hover:bg-green-500/10 hover:text-green-500'
          )}
        >
          {rule.enabled ? <Square /> : <Play />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={t('ui.common.delete')}
          onClick={() => onDelete(rule.id)}
          className="size-6 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
