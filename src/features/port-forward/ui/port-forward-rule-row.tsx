import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowRight, Play, Square, Trash2 } from 'lucide-react'
import type { PortForward } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { ToneBadge } from '@/shared/components/tone-badge'
import type { BadgeTone } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'
import { formatSpeed } from '@/features/port-forward/model/group-forwards'
import { PortForwardErrorPopover } from '@/features/port-forward/ui/port-forward-error-popover'
import { ruleState } from '@/features/port-forward/model/forward-state'
import { StatusBadge } from '@/features/port-forward/ui/port-forward-status'

interface PortForwardRuleRowProps {
  rule: PortForward
  onToggleEnabled: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onRetry: (id: string) => void
  retrying?: boolean
}

const PROTOCOL_TONE: Record<string, BadgeTone> = { tcp: 'info', udp: 'pending' }

export function PortForwardRuleRow({ rule, onToggleEnabled, onDelete, onRetry, retrying }: PortForwardRuleRowProps) {
  const { t } = useTranslation()
  const local = rule.local_port > 0 ? `${rule.bind_address}:${rule.local_port}` : null
  const state = ruleState(rule)

  return (
    <div className="group flex h-11 items-center gap-3 px-3 transition-colors hover:bg-muted/40">
      <div className="w-[86px] shrink-0">
        <StatusBadge state={state} />
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <span className="w-[20ch] truncate font-mono text-[13px]" title={local ?? undefined}>
          {local == null ? (
            <span className="text-muted-foreground uppercase">{t('ui.portForward.randomPort')}</span>
          ) : rule.running ? (
            <button
              type="button"
              className="cursor-pointer text-foreground underline decoration-dotted decoration-from-font underline-offset-4 hover:text-primary"
              title={t('ui.portForward.openLocal', { address: local })}
              onClick={() => void openUrl(`http://${local}`)}
            >
              {local}
            </button>
          ) : (
            <span className="text-muted-foreground">{local}</span>
          )}
        </span>

        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />

        <span
          className="w-[7ch] shrink-0 font-mono text-[13px] text-muted-foreground"
          title={`${rule.remote_host}:${rule.remote_port}/${rule.protocol}`}
        >
          :{rule.remote_port}
        </span>

        <ToneBadge
          tone={PROTOCOL_TONE[rule.protocol.toLowerCase()] ?? 'muted'}
          className="h-[18px] px-1.5 text-[10px] font-semibold tracking-wide uppercase"
        >
          {rule.protocol}
        </ToneBadge>
      </div>

      <div className="flex min-w-0 flex-1 items-center">
        {rule.last_error ? (
          <PortForwardErrorPopover failure={rule.last_error} retrying={retrying} onRetry={() => onRetry(rule.id)} />
        ) : null}
      </div>

      <div className="hidden w-28 shrink-0 font-mono text-[11px] leading-tight tabular-nums sm:flex sm:flex-col sm:justify-center">
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

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={rule.enabled ? t('ui.portForward.disable') : t('ui.portForward.enable')}
          onClick={() => onToggleEnabled(rule.id, !rule.enabled)}
          className={cn(
            'text-muted-foreground',
            rule.enabled
              ? 'hover:bg-amber-500/10 hover:text-amber-500'
              : 'hover:bg-emerald-500/10 hover:text-emerald-500'
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
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
