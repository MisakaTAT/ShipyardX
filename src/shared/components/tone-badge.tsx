import type { ReactNode } from 'react'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'
import { toneBadge, toneDotColor, type BadgeTone } from '@/shared/styles/variants'

interface ToneBadgeProps {
  tone: BadgeTone
  dot?: boolean
  pulse?: boolean
  className?: string
  dotClassName?: string
  children: ReactNode
}

export function ToneBadge({ tone, dot, pulse, className, dotClassName, children }: ToneBadgeProps) {
  const showDot = dot || pulse
  return (
    <Badge className={cn('leading-none', toneBadge({ tone }), className)}>
      {showDot ? (
        pulse ? (
          <span className="relative inline-flex size-1.5 shrink-0 items-center justify-center">
            <span
              className={cn(
                'absolute inline-flex size-full rounded-full opacity-60 animate-ping',
                toneDotColor({ tone })
              )}
            />
            <span
              className={cn('relative inline-flex size-full rounded-full', toneDotColor({ tone }), dotClassName)}
            />
          </span>
        ) : (
          <span className={cn('inline-block size-1.5 shrink-0 rounded-full', toneDotColor({ tone }), dotClassName)} />
        )
      ) : null}
      {children}
    </Badge>
  )
}
