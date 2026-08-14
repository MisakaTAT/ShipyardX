import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Search, Server as ServerIcon } from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import ServerDialog from '@/features/servers/ui/server-dialog'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog, EmptyState } from '@/shared/components'
import { ActiveFilterChip } from '@/shared/components/active-filter-chip'
import { usePageQuery } from '@/shared/hooks/use-page-query'
import { APP_PATHS } from '@/shared/lib/app-router'
import { CommandPaletteButton } from '@/features/command-palette/ui/command-palette-button'
import { ServerCard } from '@/features/servers/ui/server-card'
import { useDeleteServer, useServers } from '@/features/servers/api/use-servers'
import { forgetServerOs, useServerOsMap } from '@/features/servers/api/use-server-os'

interface ConnectionsProps {
  onConnect: (server: ServerConfig) => void
}

export default function Connections({ onConnect }: ConnectionsProps) {
  const { t } = useTranslation()
  const { data: servers = [], isLoading, isFetching } = useServers()
  const deleteServer = useDeleteServer()
  const serverOsMap = useServerOsMap()

  const [showDialog, setShowDialog] = useState(false)
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null)
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null)

  const openAdd = useCallback(() => {
    setEditingServer(null)
    setShowDialog(true)
  }, [])
  const { query: search, clearQuery } = usePageQuery(APP_PATHS.workspace, openAdd)

  const filtered = servers.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.host.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading || (isFetching && servers.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-auto p-3">
        <div className={`flex h-full flex-col ${servers.length > 0 ? 'gap-3' : ''}`}>
          {servers.length > 0 ? (
            <div className="shrink-0">
              <div className="flex h-8 items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">{t('ui.connections.title')}</h1>
                </div>
                <div className="flex items-center gap-2">
                  <CommandPaletteButton />
                  <Button onClick={openAdd}>
                    <Plus />
                    {t('ui.connections.add')}
                  </Button>
                </div>
              </div>

              {search ? <ActiveFilterChip query={search} count={filtered.length} onClear={clearQuery} /> : null}
            </div>
          ) : null}

          <div className="flex-1 overflow-auto">
            {servers.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4">
                <div className="max-w-xs text-center">
                  <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-7">
                    <ServerIcon />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">{t('ui.connections.emptyTitle')}</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {t('ui.connections.emptyBody')}
                  </p>
                  <div className="mt-5">
                    <Button onClick={openAdd}>
                      <Plus />
                      {t('ui.connections.add')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={Search} title={t('ui.connections.noMatch')} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
                {filtered.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    os={serverOsMap[server.id]}
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
      />

      <ConfirmDialog
        open={deleteServerId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteServerId(null)
        }}
        title={t('ui.connections.deleteTitle')}
        description={t('ui.connections.deleteDesc')}
        destructive
        confirmText={t('ui.common.delete')}
        onConfirm={() => {
          if (!deleteServerId) return
          deleteServer.mutate(deleteServerId)
          forgetServerOs(deleteServerId)
        }}
      />
    </>
  )
}
