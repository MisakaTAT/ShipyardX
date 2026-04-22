import { StatusBadge } from '@/shared/components'

interface PortForwardStatusBadgeProps {
  running?: boolean
  enabled: boolean
}

export function PortForwardStatusBadge({ running, enabled }: PortForwardStatusBadgeProps) {
  if (running) {
    return (
      <StatusBadge tone="success" pulse>
        监听中
      </StatusBadge>
    )
  }
  if (enabled) return <StatusBadge tone="pending">待启动</StatusBadge>
  return <StatusBadge tone="muted">已禁用</StatusBadge>
}
