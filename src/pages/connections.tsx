import { useState } from 'react'
import { Plus, Search, Server as ServerIcon } from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import ServerDialog from '@/features/servers/ui/server-dialog'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog, SearchInput, EmptyState } from '@/shared/components'
import { ServerCard } from '@/features/servers/ui/server-card'
import { useDeleteServer, useServers, useSetServers } from '@/features/servers/api/use-servers'

interface ConnectionsProps {
  onConnect: (server: ServerConfig) => void
}

export default function Connections({ onConnect }: ConnectionsProps) {
  const { data: servers = [] } = useServers()
  const deleteServer = useDeleteServer()
  const setServers = useSetServers()

  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null)
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null)

  const filtered = servers.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.host.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd = () => {
    setEditingServer(null)
    setShowDialog(true)
  }

  return (
    <>
      <div className="flex-1 overflow-auto p-3">
        <div className={`flex h-full flex-col ${servers.length > 0 ? 'gap-3' : ''}`}>
          {servers.length > 0 ? (
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">服务器</h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    管理远程服务器连接，选择一个服务器进入工作区。
                  </p>
                </div>
                <Button onClick={openAdd}>
                  <Plus />
                  添加服务器
                </Button>
              </div>

              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder='搜索服务器名称或地址… ("/" 快速聚焦)'
                className="mt-4 w-full"
              />
            </div>
          ) : null}

          <div className="flex-1 overflow-auto">
            {servers.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4">
                <div className="max-w-xs text-center">
                  <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-7">
                    <ServerIcon />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">尚未配置远程服务器</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    配置完成后，可在此查看系统概览、管理 Docker
                    容器与镜像，并使用集成终端。连接凭据仅保存在本机，不会上传至其他服务。
                  </p>
                  <div className="mt-5">
                    <Button onClick={openAdd}>
                      <Plus />
                      添加服务器
                    </Button>
                  </div>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={Search} title="没有找到匹配的服务器" />
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filtered.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    onConnect={() => onConnect(server)}
                    onEdit={() => {
                      setEditingServer(server)
                      setShowDialog(true)
                    }}
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
        onSave={setServers}
      />

      <ConfirmDialog
        open={deleteServerId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteServerId(null)
        }}
        title="删除服务器"
        description="确定要删除此服务器配置吗？此操作不可撤销。"
        destructive
        confirmText="删除"
        onConfirm={() => {
          if (!deleteServerId) return
          deleteServer.mutate(deleteServerId)
        }}
      />
    </>
  )
}
