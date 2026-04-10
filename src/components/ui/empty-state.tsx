import * as React from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

type EmptyStateVariant = 'panel' | 'search' | 'hero'

type EmptyStateProps = {
  variant?: EmptyStateVariant
  icon: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

function EmptyState({ variant = 'panel', icon, title, description, action, className }: EmptyStateProps) {
  if (variant === 'hero') {
    return (
      <div className={cn('flex h-full items-center justify-center px-4', className)}>
        <div className="max-w-xs text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-7">
            {icon}
          </div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    )
  }

  if (variant === 'search') {
    return (
      <div className={cn('flex min-h-48 flex-col items-center justify-center text-center', className ?? 'h-full')}>
        <div className="flex justify-center text-border [&_svg]:size-7">{icon}</div>
        <p className="mt-2 text-sm text-muted-foreground">{title}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex h-48 flex-col items-center justify-center text-muted-foreground', className)}>
      <div className="mb-3 flex justify-center text-border [&_svg]:h-10 [&_svg]:w-10">{icon}</div>
      <p className="text-sm">{title}</p>
    </div>
  )
}

type PanelListLoadingProps = {
  className?: string
  fullHeight?: boolean
}

function PanelListLoading({ className, fullHeight }: PanelListLoadingProps) {
  return (
    <div className={cn('flex items-center justify-center', fullHeight ? 'h-full min-h-48' : 'h-48', className)}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export { EmptyState, PanelListLoading }
