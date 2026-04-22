import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface EmptyStateProps {
  icon?: ComponentType<LucideProps>
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * 统一空态。用于列表/面板/页面的 "没有数据 / 无匹配 / 首次使用"。
 */
export function EmptyState({ icon: Icon, title, description, action, className, size = 'md' }: EmptyStateProps) {
  const minH = size === 'sm' ? 'min-h-32' : size === 'lg' ? 'min-h-80' : 'min-h-48'
  const iconSize = size === 'lg' ? 'size-7' : size === 'sm' ? 'size-5' : 'size-7'

  return (
    <div className={cn('flex w-full flex-col items-center justify-center px-4 py-6 text-center', minH, className)}>
      {Icon ? (
        <div className={cn('flex justify-center text-border', `[&_svg]:${iconSize}`)}>
          <Icon />
        </div>
      ) : null}
      {title ? <p className="mt-2 text-sm font-medium text-foreground">{title}</p> : null}
      {description ? <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
