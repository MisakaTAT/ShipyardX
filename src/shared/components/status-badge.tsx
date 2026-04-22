import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { statusDot, statusBadge, type StatusTone } from '@/shared/styles/variants'

interface StatusBadgeProps {
  tone: StatusTone
  pulse?: boolean
  className?: string
  dotClassName?: string
  children: ReactNode
}

/**
 * 通用状态徽章：圆点 + 文案。替代各面板里的 ContainerStateBadge / PortForwardStatusBadge / 事件状态等重复实现。
 */
export function StatusBadge({ tone, pulse, className, dotClassName, children }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadge({ tone }), className)}>
      <span className={cn(statusDot({ tone, pulse: pulse ? true : false }), dotClassName)} />
      {children}
    </span>
  )
}
