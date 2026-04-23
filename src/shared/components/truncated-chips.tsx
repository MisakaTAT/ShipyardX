import * as React from 'react'

import { cn } from '@/shared/lib/utils'
import { chipVariants } from '@/shared/styles/variants'

export interface TruncatedChipsProps {
  items: string[]
  maxVisible?: number
  empty?: React.ReactNode
  title?: string
  className?: string
  chipClassName?: string
  moreClassName?: string
  maxChipWidth?: number
  mono?: boolean
}

export function TruncatedChips({
  items,
  maxVisible = 2,
  empty = <span>{'-'}</span>,
  title,
  className,
  chipClassName,
  moreClassName,
  maxChipWidth = 200,
  mono = true,
}: TruncatedChipsProps) {
  const list = items.map((s) => s.trim()).filter(Boolean)
  if (list.length === 0) return empty

  const visible = list.slice(0, maxVisible)
  const hiddenCount = list.length - visible.length
  const resolvedTitle = title ?? list.join(', ')

  return (
    <div className={cn('flex flex-wrap gap-1', className)} title={resolvedTitle}>
      {visible.map((item, i) => (
        <span
          key={`${i}-${item}`}
          className={cn(chipVariants({ mono, truncate: true }), chipClassName)}
          style={maxChipWidth ? ({ maxWidth: maxChipWidth } satisfies React.CSSProperties) : undefined}
        >
          {item}
        </span>
      ))}
      {hiddenCount > 0 ? <span className={cn(chipVariants({ mono }), moreClassName)}>+{hiddenCount}</span> : null}
    </div>
  )
}
