import { useState, useEffect, useRef } from 'react'
import { commands } from '@/types/app-bindings'
import { Server, Plus, Pencil, Trash2, Search, KeyRound, Lock, ArrowRight } from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import { Button } from '@/components/ui/button'
import { PageListColumn, PageScrollArea } from '@/components/ui/page-frame'
import { PanelToolbarSearch } from '@/components/ui/panel-toolbar'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ServerDialog from '@/components/server/dialogs/ServerDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

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
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.host.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <PageScrollArea>
        <PageListColumn gap={servers.length > 0}>
          {servers.length > 0 ? (
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-(--text-strong)">服务器</h1>
                  <p className="mt-0.5 text-xs text-(--text-muted)">管理远程服务器连接，选择一个服务器进入工作区。</p>
                </div>
                <Button onClick={handleAdd}>
                  <Plus />
                  添加服务器
                </Button>
              </div>

              <PanelToolbarSearch
                ref={searchRef}
                variant="page"
                value={search}
                onValueChange={setSearch}
                placeholder='搜索服务器名称或地址… ("/" 快速聚焦)'
              />
            </div>
          ) : null}

          <div className="flex-1 overflow-auto">
            {servers.length === 0 ? (
              <EmptyState onAdd={handleAdd} />
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
                    onEdit={() => handleEdit(server)}
                    onDelete={() => setDeleteServerId(server.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </PageListColumn>
      </PageScrollArea>

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

      <ConfirmDialog
        open={deleteServerId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteServerId(null)
        }}
        title="删除服务器"
        description="确定要删除此服务器配置吗？此操作不可撤销。"
        confirmText="删除"
        onConfirm={executeDeleteServer}
      />
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
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-(--bg-panel) shadow-none ring-0 transition-colors hover:bg-(--bg-surface)"
      onClick={onConnect}
    >
      <CardContent className="px-4 pt-4 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <div
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
          >
            <Server className="size-[15px] text-(--accent-text)" />
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
          <Button type="button" variant="ghostAccent" icon title="编辑" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button type="button" variant="ghostDanger" icon title="删除" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>

        <div className="flex items-center gap-1 text-[12px] font-medium text-(--accent-text)">
          连接
          <ArrowRight className="size-3.5" />
        </div>
      </CardFooter>
    </Card>
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
          <Server className="size-7 text-(--accent-text)" />
        </div>
        <h2 className="text-sm font-semibold text-(--text-strong)">尚未配置远程服务器</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-(--text-muted)">
          配置完成后，可在此查看系统概览、管理 Docker
          容器与镜像，并使用集成终端。连接凭据仅保存在本机，不会上传至其他服务。
        </p>
        <Button className="mt-5" onClick={onAdd}>
          <Plus />
          添加服务器
        </Button>
      </div>
    </div>
  )
}
