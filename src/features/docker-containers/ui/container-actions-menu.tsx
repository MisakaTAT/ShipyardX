import {
  BarChart2,
  FileText,
  MoreHorizontal,
  Play,
  RotateCcw,
  ScanSearch,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import type { Container } from '@/types/app-bindings'

interface ContainerActionsMenuProps {
  container: Container
  busy?: boolean
  onAction: (action: 'start' | 'stop' | 'restart') => void
  onRemove: () => void
  onExec: () => void
  onStats: () => void
  onLog: () => void
  onInspect: () => void
}

export function ContainerActionsMenu({
  container,
  busy,
  onAction,
  onRemove,
  onExec,
  onStats,
  onLog,
  onInspect,
}: ContainerActionsMenuProps) {
  const isRunning = container.state === 'running'
  const disabled = Boolean(busy)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" title="更多操作" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => onAction('start')} disabled={isRunning || disabled}>
          <Play className="size-3.5" />
          启动
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('stop')} disabled={!isRunning || disabled}>
          <Square className="size-3.5" />
          停止
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('restart')} disabled={disabled}>
          <RotateCcw className="size-3.5" />
          重启
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExec} disabled={!isRunning}>
          <Terminal className="size-3.5" />
          容器终端
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStats} disabled={!isRunning}>
          <BarChart2 className="size-3.5" />
          资源监控
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLog}>
          <FileText className="size-3.5" />
          日志
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onInspect}>
          <ScanSearch className="size-3.5" />
          Inspect
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onRemove} disabled={disabled}>
          <Trash2 className="size-3.5" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
