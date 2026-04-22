import type { CSSProperties, ReactNode } from 'react'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'
import { toneBadge, toneDotColor, type BadgeTone } from '@/shared/styles/variants'

interface ToneBadgeProps {
  tone: BadgeTone
  dot?: boolean
  pulse?: boolean
  maxWidth?: number | string
  className?: string
  dotClassName?: string
  style?: CSSProperties
  children: ReactNode
}

export function ToneBadge({ tone, dot, pulse, maxWidth, className, dotClassName, style, children }: ToneBadgeProps) {
  const showDot = dot || pulse
  const mergedStyle =
    maxWidth !== undefined ? { maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth, ...style } : style
  return (
    <Badge className={cn('leading-none', toneBadge({ tone }), className)} style={mergedStyle}>
      {showDot ? (
        pulse ? (
          <span className="relative inline-flex size-1.5 shrink-0 items-center justify-center">
            <span
              className={cn(
                'absolute inline-flex size-full animate-ping rounded-full opacity-60',
                toneDotColor({ tone })
              )}
            />
            <span className={cn('relative inline-flex size-full rounded-full', toneDotColor({ tone }), dotClassName)} />
          </span>
        ) : (
          <span className={cn('inline-block size-1.5 shrink-0 rounded-full', toneDotColor({ tone }), dotClassName)} />
        )
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </Badge>
  )
}
