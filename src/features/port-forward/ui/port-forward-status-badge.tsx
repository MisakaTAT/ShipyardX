import { useTranslation } from 'react-i18next'
import { ToneBadge } from '@/shared/components'

interface PortForwardStatusBadgeProps {
  running?: boolean
  enabled: boolean
}

export function PortForwardStatusBadge({ running, enabled }: PortForwardStatusBadgeProps) {
  const { t } = useTranslation()
  if (running) {
    return (
      <ToneBadge tone="success" dot pulse>
        {t('ui.portForward.statusListening')}
      </ToneBadge>
    )
  }
  if (enabled) {
    return (
      <ToneBadge tone="pending" dot>
        {t('ui.portForward.statusPending')}
      </ToneBadge>
    )
  }
  return (
    <ToneBadge tone="muted" dot>
      {t('ui.portForward.statusDisabled')}
    </ToneBadge>
  )
}
