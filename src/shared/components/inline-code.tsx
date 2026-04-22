import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

interface InlineCodeProps {
  children: ReactNode
  className?: string
  block?: boolean
}

export function InlineCode({ children, className, block }: InlineCodeProps) {
  if (block) {
    return (
      <pre className={cn('mt-1 rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground', className)}>
        {children}
      </pre>
    )
  }
  return (
    <code className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground', className)}>
      {children}
    </code>
  )
}
