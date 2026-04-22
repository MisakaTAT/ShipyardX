import { ArrowRight, KeyRound, Lock, Pencil, Server as ServerIcon, Trash2 } from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardFooter } from '@/shared/ui/card'
import { Badge } from '@/shared/ui/badge'

interface ServerCardProps {
  server: ServerConfig
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ServerCard({ server, onConnect, onEdit, onDelete }: ServerCardProps) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-none ring-0 transition-colors hover:bg-muted"
      onClick={onConnect}
    >
      <CardContent className="px-4 pt-4 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12">
            <ServerIcon className="size-[15px] text-primary" />
          </div>
          <Badge
            variant="secondary"
            className="h-5 gap-1 rounded-full border-0 bg-muted px-2 py-0 text-[10px] font-normal text-muted-foreground"
          >
            {server.auth_type === 'key' ? <KeyRound className="size-2.5" /> : <Lock className="size-2.5" />}
            {server.auth_type === 'key' ? '密钥' : '密码'}
          </Badge>
        </div>

        <h3 className="truncate text-[13px] leading-tight font-semibold text-foreground">{server.name}</h3>
        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          {server.username}@{server.host}:{server.port}
        </p>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t-0 bg-muted/50 px-4 py-2.5">
        <div
          className="invisible flex items-center gap-1 group-hover:visible"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button type="button" variant="ghost" size="icon-sm" title="编辑" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button type="button" variant="destructive" size="icon-sm" title="删除" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>

        <div className="flex items-center gap-1 text-[12px] font-medium text-primary">
          连接
          <ArrowRight className="size-3.5" />
        </div>
      </CardFooter>
    </Card>
  )
}
