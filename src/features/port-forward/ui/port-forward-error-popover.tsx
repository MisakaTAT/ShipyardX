import { useTranslation } from 'react-i18next'
import { RotateCw } from 'lucide-react'
import type { PortForwardError } from '@/types/app-bindings'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/shared/ui/popover'
import { Button } from '@/shared/ui/button'
import { resolveAppError } from '@/shared/lib/errors'
import { formatRelativeTime } from '@/shared/lib/datetime'
import { cn } from '@/shared/lib/utils'

interface PortForwardErrorPopoverProps {
  failure: PortForwardError
  onRetry?: () => void
  retrying?: boolean
  triggerClassName?: string
}

export function PortForwardErrorPopover({
  failure,
  onRetry,
  retrying,
  triggerClassName,
}: PortForwardErrorPopoverProps) {
  const { t, i18n } = useTranslation()
  const resolved = resolveAppError(failure.error)

  const detail = resolved.detail?.trim()
  const showDetail = Boolean(detail) && detail !== resolved.message

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'group absolute inline-flex size-6 shrink-0 cursor-pointer items-center justify-center outline-hidden focus-visible:ring-2 focus-visible:ring-red-500/40',
          triggerClassName
        )}
        aria-label={t('ui.portForward.errorTitle')}
      >
        <span
          className="absolute inset-0 animate-pulse bg-red-500 transition-colors [clip-path:polygon(0_0,100%_0,0_100%)] group-hover:bg-red-600 motion-reduce:animate-none"
          aria-hidden
        />
        <span
          className="relative -translate-x-1 -translate-y-1 text-[9px] leading-none font-bold text-white"
          aria-hidden
        >
          X
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <div className="flex items-baseline justify-between gap-2">
            <PopoverTitle className="text-red-500">{resolved.message}</PopoverTitle>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatRelativeTime(failure.at_ms, i18n.language)}
            </span>
          </div>
        </PopoverHeader>

        {resolved.action ? <p className="text-muted-foreground">{resolved.action}</p> : null}

        {showDetail ? (
          <details className="group">
            <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
              <span className="inline-block transition-transform group-open:rotate-90">▸</span>{' '}
              {t('ui.portForward.errorDetail')}
            </summary>
            <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-muted/50 p-2 font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
              {detail}
            </pre>
          </details>
        ) : null}

        {resolved.retryable && onRetry ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
              <RotateCw className={retrying ? 'animate-spin' : undefined} />
              {retrying ? t('ui.portForward.errorRetrying') : t('ui.portForward.errorRetry')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
