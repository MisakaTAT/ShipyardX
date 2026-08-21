import { useTranslation } from 'react-i18next'
import { ToneBadge } from '@/shared/components/tone-badge'
import { toneDotColor, type BadgeTone } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'
import type { ForwardState } from '@/features/port-forward/model/forward-state'

const STATE_TONE: Record<ForwardState, BadgeTone> = {
  failed: 'danger',
  running: 'success',
  pending: 'pending',
  disabled: 'muted',
}

const STATE_LABEL = {
  failed: 'ui.portForward.statusFailed',
  running: 'ui.portForward.statusListening',
  pending: 'ui.portForward.statusPending',
  disabled: 'ui.portForward.statusDisabled',
} as const satisfies Record<ForwardState, string>

export function StatusDot({ state, className }: { state: ForwardState; className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn('size-1.5 shrink-0 rounded-full', toneDotColor({ tone: STATE_TONE[state] }), className)}
      title={t(STATE_LABEL[state])}
    >
      <span className="sr-only">{t(STATE_LABEL[state])}</span>
    </span>
  )
}

export function StatusBadge({ state, className }: { state: ForwardState; className?: string }) {
  const { t } = useTranslation()
  return (
    <ToneBadge
      tone={STATE_TONE[state]}
      dot
      pulse={state === 'running'}
      className={cn('h-5 gap-1.5 px-2 text-[11px] font-medium', className)}
    >
      {t(STATE_LABEL[state])}
    </ToneBadge>
  )
}
