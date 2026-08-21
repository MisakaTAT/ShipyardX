import { useTranslation } from 'react-i18next'
import { RotateCw, TriangleAlert } from 'lucide-react'
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
  className?: string
}

export function PortForwardErrorPopover({ failure, onRetry, retrying, className }: PortForwardErrorPopoverProps) {
  const { t, i18n } = useTranslation()
  const resolved = resolveAppError(failure.error)

  const detail = resolved.detail?.trim()
  const showDetail = Boolean(detail) && detail !== resolved.message

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-destructive outline-hidden transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive/40',
          '[&_svg]:-translate-y-[0.5px]',
          className
        )}
        aria-label={t('ui.portForward.errorTitle')}
      >
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{resolved.message}</span>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <div className="flex items-baseline justify-between gap-2">
            <PopoverTitle className="text-destructive">{resolved.message}</PopoverTitle>
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
