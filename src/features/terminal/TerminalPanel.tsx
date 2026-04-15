import { Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Terminal from '@/components/terminal/Terminal'

interface TerminalPanelProps {
  serverId: string
  containerId?: string
  title?: string
  onRequestClose?: () => void
}

export default function TerminalPanel({ serverId, containerId, title, onRequestClose }: TerminalPanelProps) {
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
                title="关闭"
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="relative flex-1 overflow-hidden">
        <Terminal serverId={serverId} containerId={containerId} />
      </div>
    </div>
  )
}
