import { useState, useEffect, useRef } from 'react'
import { commands } from '@/types/app-bindings'
import { Server, Plus, Pencil, Trash2, Search, KeyRound, Lock, ArrowRight, X } from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import ServerDialog from '@/features/server/ServerDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConnectionsProps {
  onConnect: (server: ServerConfig) => void
}

export default function Connections({ onConnect }: ConnectionsProps) {
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null)
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    commands.getServers().then(setServers).catch(console.error)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSave = (updated: ServerConfig[]) => {
    setServers(updated)
  }

  const handleAdd = () => {
    setEditingServer(null)
    setShowDialog(true)
  }

  const handleEdit = (server: ServerConfig) => {
    setEditingServer(server)
    setShowDialog(true)
  }

  const executeDeleteServer = async () => {
    const id = deleteServerId
    if (!id) return
    try {
      const updated = await commands.deleteServer(id)
      setServers(updated)
    } catch (e) {
      console.error(e)
    }
  }

  const filtered = servers.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.host.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="flex-1 overflow-auto p-2 md:p-3">
        <div className={`flex h-full flex-col ${servers.length > 0 ? 'gap-3' : ''}`}>
          {servers.length > 0 ? (
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">服务器</h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">管理远程服务器连接，选择一个服务器进入工作区。</p>
                </div>
                <Button onClick={handleAdd}>
                  <Plus />
                  添加服务器
                </Button>
              </div>

              <div className="relative mt-4 w-full">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder='搜索服务器名称或地址… ("/" 快速聚焦)'
                  className="w-full pr-8 pl-9"
                />
                {search ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-1/2 right-1 size-7 -translate-y-1/2 rounded-full text-muted-foreground"
                    aria-label="清除搜索"
                    onClick={() => setSearch('')}
                  >
                    <X className="size-3" />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex-1 overflow-auto">
            {servers.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4">
                <div className="max-w-xs text-center">
                  <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-7">
                    <Server />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">尚未配置远程服务器</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    配置完成后，可在此查看系统概览、管理 Docker
                    容器与镜像，并使用集成终端。连接凭据仅保存在本机，不会上传至其他服务。
                  </p>
                  <div className="mt-5">
                    <Button onClick={handleAdd}>
                      <Plus />
                      添加服务器
                    </Button>
                  </div>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <div className="flex justify-center text-border [&_svg]:size-7">
                  <Search />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">没有找到匹配的服务器</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    onConnect={() => onConnect(server)}
                    onEdit={() => handleEdit(server)}
                    onDelete={() => setDeleteServerId(server.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ServerDialog
        open={showDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDialog(false)
            setEditingServer(null)
          }
        }}
        server={editingServer}
        onSave={handleSave}
      />

      <AlertDialog
        open={deleteServerId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteServerId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除服务器</AlertDialogTitle>
            <AlertDialogDescription>确定要删除此服务器配置吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void executeDeleteServer().finally(() => setDeleteServerId(null))
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ServerCard({
  server,
  onConnect,
  onEdit,
  onDelete,
}: {
  server: ServerConfig
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-none ring-0 transition-colors hover:bg-muted"
      onClick={onConnect}
    >
      <CardContent className="px-4 pt-4 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12">
            <Server className="size-[15px] text-primary" />
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
