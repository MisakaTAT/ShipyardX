import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

interface PanelShellProps {
  children: ReactNode
  className?: string
}

/** 面板外壳：header + 可滚动内容 的垂直布局骨架 */
export function PanelShell({ children, className }: PanelShellProps) {
  return <div className={cn('flex h-full min-h-0 flex-col bg-card', className)}>{children}</div>
}
