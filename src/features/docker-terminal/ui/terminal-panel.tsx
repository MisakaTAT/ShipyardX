import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'

// xterm 和一堆 addon 只在打开终端时才需要
const Terminal = lazy(() => import('@/features/docker-terminal/ui/terminal'))

interface TerminalPanelProps {
  serverId: string
  containerId?: string
  title?: string
  onRequestClose?: () => void
}

export default function TerminalPanel({ serverId, containerId, title, onRequestClose }: TerminalPanelProps) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col bg-card">
      {title ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <TerminalIcon className="shrink-0" />
            <span className="truncate">{title}</span>
          </div>
          <div className="flex items-center gap-1">
            {onRequestClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={onRequestClose}
                title={t('ui.common.close')}
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="relative flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <Terminal serverId={serverId} containerId={containerId} />
        </Suspense>
      </div>
    </div>
  )
}
