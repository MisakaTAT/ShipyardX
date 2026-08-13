import type { MouseEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, Pencil, Server as ServerIcon, Trash2 } from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { resolveDistroLogo } from '@/shared/lib/distro-logo'

type StopEvent = (e: MouseEvent | KeyboardEvent) => void

interface ServerCardProps {
  server: ServerConfig
  /** 上次连接时记录的发行版名称，仅用于选择图标。 */
  os?: string
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
}

function DistroAvatar({ os }: { os?: string }) {
  const logo = resolveDistroLogo(os)
  return (
    <div className="flex size-9.5 shrink-0 items-center justify-center rounded-[10px] bg-muted">
      {logo ? (
        <svg viewBox="0 0 24 24" className="size-5.5" fill={logo.hex} role="img" aria-label={logo.title}>
          <path d={logo.path} />
        </svg>
      ) : (
        <ServerIcon className="size-5.25 text-muted-foreground" />
      )}
    </div>
  )
}

export function ServerCard({ server, os, onConnect, onEdit, onDelete }: ServerCardProps) {
  const { t } = useTranslation()
  const stopEvent: StopEvent = (e) => e.stopPropagation()

  return (
    <div
      className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
      onClick={onConnect}
    >
      <DistroAvatar os={os} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-foreground">{server.name}</div>
        <div className="truncate font-mono text-[12px] text-muted-foreground">
          {server.username}@{server.host}:{server.port}
        </div>
      </div>
      <div onClick={stopEvent} onKeyDown={stopEvent}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" title={t('ui.common.moreActions')} />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-32">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-3.5" />
              {t('ui.common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              {t('ui.common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
