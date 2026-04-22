import { ToneBadge } from '@/shared/components'

interface PortForwardStatusBadgeProps {
  running?: boolean
  enabled: boolean
}

export function PortForwardStatusBadge({ running, enabled }: PortForwardStatusBadgeProps) {
  if (running) {
    return (
      <ToneBadge tone="success" dot pulse>
        监听中
      </ToneBadge>
    )
  }
  if (enabled) {
    return (
      <ToneBadge tone="pending" dot>
        待启动
      </ToneBadge>
    )
  }
  return (
    <ToneBadge tone="muted" dot>
      已禁用
    </ToneBadge>
  )
}
