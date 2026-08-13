import { useTranslation } from 'react-i18next'
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
import { canStopContainer } from '@/features/docker-containers/lib/container-state'
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
  const { t } = useTranslation()
  const isRunning = container.state === 'running'
  const canStop = canStopContainer(container.state)
  const disabled = Boolean(busy)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" title={t('ui.common.moreActions')} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        <DropdownMenuItem onClick={() => onAction('start')} disabled={isRunning || disabled}>
          <Play className="size-3.5" />
          {t('ui.containers.start')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('stop')} disabled={!canStop || disabled}>
          <Square className="size-3.5" />
          {t('ui.containers.stop')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('restart')} disabled={disabled}>
          <RotateCcw className="size-3.5" />
          {t('ui.containers.restart')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExec} disabled={!isRunning}>
          <Terminal className="size-3.5" />
          {t('ui.containers.terminal')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStats} disabled={!isRunning}>
          <BarChart2 className="size-3.5" />
          {t('ui.containers.stats')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLog}>
          <FileText className="size-3.5" />
          {t('ui.containers.logs')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onInspect}>
          <ScanSearch className="size-3.5" />
          Inspect
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onRemove} disabled={disabled}>
          <Trash2 className="size-3.5" />
          {t('ui.common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
