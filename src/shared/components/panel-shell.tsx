import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

interface PanelShellProps {
  children: ReactNode
  className?: string
}

/**
 * 面板外壳：提供标准的 "header + 可滚动内容" 垂直布局，白底、圆角由外层（Workspace）统一决定。
 */
export function PanelShell({ children, className }: PanelShellProps) {
  return <div className={cn('flex h-full min-h-0 flex-col bg-card', className)}>{children}</div>
}
