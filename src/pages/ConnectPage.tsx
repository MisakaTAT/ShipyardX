import { useState } from 'react'
import { Server as ServerIcon, Plus, Pencil, Trash2, Search, X, KeyRound, Lock, ArrowRight } from 'lucide-react'
import type { Server } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ConnectPageProps {
  servers: Server[]
  onConnect: (server: Server) => void
  onAdd: () => void
  onEdit: (server: Server) => void
  onDelete: (id: string) => void
}

export default function ConnectPage({ servers, onConnect, onAdd, onEdit, onDelete }: ConnectPageProps) {
  const [search, setSearch] = useState('')

  const filtered = servers.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.host.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex-1 overflow-auto p-2 md:p-3">
      <div className="flex h-full flex-col gap-3">
        <div className="shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-(--text-strong)">服务器</h1>
              <p className="mt-0.5 text-xs text-(--text-muted)">管理远程服务器连接，选择一个服务器进入工作区。</p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={onAdd}>
              <Plus className="size-3.5 stroke-[2.5]" />
              添加服务器
            </Button>
          </div>

          {servers.length > 0 && (
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-(--text-muted)" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索服务器名称或地址…"
                className="pr-8 pl-9"
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-(--text-muted)"
                  onClick={() => setSearch('')}
                >
                  <X className="size-3" />
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {servers.length === 0 ? (
            <EmptyState onAdd={onAdd} />
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Search className="size-7 text-(--border-sub)" />
              <p className="mt-2 text-sm text-(--text-muted)">没有找到匹配的服务器</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  onConnect={() => onConnect(server)}
                  onEdit={() => onEdit(server)}
                  onDelete={() => onDelete(server.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ServerCard({
  server,
  onConnect,
  onEdit,
  onDelete,
}: {
  server: Server
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-(--bg-panel) shadow-none ring-0 transition-colors hover:bg-(--bg-surface)"
      onClick={onConnect}
    >
      <CardContent className="px-4 pt-4 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <div
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
          >
            <ServerIcon className="size-[15px] text-(--accent-text)" />
          </div>
          <Badge
            variant="secondary"
            className="h-5 gap-1 rounded-full border-0 bg-(--bg-surface) px-2 py-0 text-[10px] font-normal text-(--text-soft)"
          >
            {server.auth_type === 'key' ? <KeyRound className="size-2.5" /> : <Lock className="size-2.5" />}
            {server.auth_type === 'key' ? '密钥' : '密码'}
          </Badge>
        </div>

        <h3 className="truncate text-[13px] leading-tight font-semibold text-(--text-strong)">{server.name}</h3>
        <p className="mt-1 truncate font-mono text-[11px] text-(--text-muted)">
          {server.username}@{server.host}:{server.port}
        </p>
      </CardContent>

      <CardFooter
        className="flex items-center justify-between border-t-0 bg-transparent px-4 py-2.5"
        style={{ background: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)' }}
      >
        <div
          className="invisible flex items-center gap-1 group-hover:visible"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ActionBtn icon={<Pencil className="size-3" />} label="编辑" onClick={onEdit} />
          <ActionBtn icon={<Trash2 className="size-3" />} label="删除" onClick={onDelete} danger />
        </div>

        <div className="flex items-center gap-1 text-[11px] font-medium text-(--accent-text)">
          连接
          <ArrowRight className="size-3" />
        </div>
      </CardFooter>
    </Card>
  )
}

function ActionBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title={label}
      onClick={onClick}
      className={cn(
        'text-(--text-muted)',
        danger && 'hover:bg-red-500/10 hover:text-red-500',
        !danger && 'hover:bg-(--bg-panel) hover:text-(--text-base)',
      )}
    >
      {icon}
    </Button>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-xs text-center">
        <div
          className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
        >
          <ServerIcon className="size-7 text-(--accent-text)" />
        </div>
        <h2 className="text-sm font-semibold text-(--text-strong)">还没有服务器</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-(--text-muted)">
          添加你的第一个远程服务器连接，开始管理 Docker 容器和镜像。
        </p>
        <Button size="sm" className="mt-5 gap-1.5" onClick={onAdd}>
          <Plus className="size-3.5 stroke-[2.5]" />
          添加服务器
        </Button>
      </div>
    </div>
  )
}
