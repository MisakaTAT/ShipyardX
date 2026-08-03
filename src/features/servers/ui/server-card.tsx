import type { MouseEvent, KeyboardEvent } from 'react'
import { MoreHorizontal, Pencil, RefreshCw, Server as ServerIcon, Trash2 } from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { resolveDistroLogo } from '@/shared/lib/distro-logo'
import { formatRelativeTime } from '@/shared/lib/datetime'
import type { ServerSnapshot } from '@/features/servers/model/server-snapshot'
import { cn } from '@/shared/lib/utils'

type StopEvent = (e: MouseEvent | KeyboardEvent) => void

interface ServerCardProps {
  server: ServerConfig
  snapshot?: ServerSnapshot
  refreshing?: boolean
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
}

function DistroAvatar({ os, ok }: { os?: string; ok?: boolean }) {
  const logo = resolveDistroLogo(os)
  return (
    <div className="relative shrink-0">
      <div className="flex size-9.5 items-center justify-center rounded-[10px] bg-muted">
        {logo ? (
          <svg viewBox="0 0 24 24" className="size-5.5" fill={logo.hex} role="img" aria-label={logo.title}>
            <path d={logo.path} />
          </svg>
        ) : (
          <ServerIcon className="size-5.25 text-muted-foreground" />
        )}
      </div>
      <span
        className={cn(
          'absolute -right-0.5 -bottom-0.5 size-2.75 rounded-full border-2 border-card',
          ok === undefined && 'bg-muted-foreground/40',
          ok === true && 'bg-emerald-500',
          ok === false && 'bg-red-500'
        )}
      />
    </div>
  )
}

const PLACEHOLDER = '—'

function SnapshotFooter({
  snapshot,
  refreshing,
  onRefresh,
  onStop,
}: {
  snapshot?: ServerSnapshot
  refreshing?: boolean
  onRefresh: () => void
  onStop: StopEvent
}) {
  const refreshButton = (
    <span className="-my-1 ml-auto shrink-0" onClick={onStop} onKeyDown={onStop}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-6"
        title="重新检测"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshCw
          className={cn(
            'size-3.5',
            refreshing ? 'animate-spin' : 'transition-transform duration-300 group-hover/button:rotate-180'
          )}
        />
      </Button>
    </span>
  )

  return (
    <div className="mt-3 border-t border-border pt-2.5 text-[12px] leading-4.5 text-muted-foreground">
      {snapshot ? (
        <>
          {snapshot.ok ? (
            <div className="flex items-center gap-2.5">
              <span className="min-w-0 truncate" title={snapshot.os || undefined}>
                {snapshot.os || PLACEHOLDER}
              </span>
              <span className="ml-auto shrink-0">
                {snapshot.dockerVersion ? `Docker ${snapshot.dockerVersion}` : PLACEHOLDER}
              </span>
            </div>
          ) : (
            <div className="truncate" title={snapshot.error}>
              {snapshot.error || '连接失败'}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2.5">
            <span className="min-w-0 truncate">{formatRelativeTime(snapshot.at)}</span>
            {refreshButton}
          </div>
        </>
      ) : (
        <div className="flex h-10 items-center gap-2.5">
          <span className="min-w-0 truncate">从未连接</span>
          {refreshButton}
        </div>
      )}
    </div>
  )
}

export function ServerCard({ server, snapshot, refreshing, onConnect, onEdit, onDelete, onRefresh }: ServerCardProps) {
  const stopEvent: StopEvent = (e) => e.stopPropagation()

  return (
    <div
      className="cursor-pointer rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-muted/50"
      onClick={onConnect}
    >
      <div className="flex items-center gap-3">
        <DistroAvatar os={snapshot?.os} ok={snapshot?.ok} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-foreground">{server.name}</div>
          <div className="truncate font-mono text-[12px] text-muted-foreground">
            {server.username}@{server.host}:{server.port}
          </div>
        </div>
        <div onClick={stopEvent} onKeyDown={stopEvent}>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" title="更多操作" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-3.5" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SnapshotFooter snapshot={snapshot} refreshing={refreshing} onRefresh={onRefresh} onStop={stopEvent} />
    </div>
  )
}
