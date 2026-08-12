import { useEffect } from 'react'
import { toast } from '@/shared/components/toast'
import {
  Activity,
  Box,
  Database,
  Layers,
  Loader2,
  Server as ServerIcon,
  Settings2,
  Share2,
  Terminal,
} from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import ContainerPanel from '@/features/docker-containers/ui/container-panel'
import ImagePanel from '@/features/docker-images/ui/image-panel'
import NetworkPanel from '@/features/docker-networks/ui/network-panel'
import VolumePanel from '@/features/docker-volumes/ui/volume-panel'
import TerminalPanel from '@/features/docker-terminal/ui/terminal-panel'
import ServerOverview from '@/features/docker-engine/ui/server-overview'
import DockerManagePanel from '@/features/docker-engine/ui/docker-manage-panel'
import EventPanel from '@/features/docker-events/ui/event-panel'
import { useDockerAccess } from '@/features/docker-engine/api/use-docker-access'
import { useServerConnection } from '@/features/servers/api/use-server-connection'
import { useRecordServerOs } from '@/features/servers/api/use-server-os'
import { useDockerEventInvalidation } from '@/shared/api/events'
import { DockerAccessGuide } from '@/pages/workspace/docker-access-guide'
import { WorkspaceTabs, type WorkspaceTabItem } from '@/pages/workspace/workspace-tabs'
import { KeepAlive } from '@/shared/components/keep-alive'
import { cn } from '@/shared/lib/utils'
import { onWorkspaceNavigate, type WorkspaceNavigateTarget } from '@/shared/lib/workspace-nav'

export type WorkspaceTab =
  | 'overview'
  | 'containers'
  | 'images'
  | 'networks'
  | 'volumes'
  | 'docker'
  | 'events'
  | 'terminal'

const NAV_ITEMS: WorkspaceTabItem<WorkspaceTab>[] = [
  { key: 'overview', icon: <ServerIcon className="size-4.5" />, label: '概览' },
  { key: 'containers', icon: <Box className="size-4.5" />, label: '容器' },
  { key: 'images', icon: <Layers className="size-4.5" />, label: '镜像' },
  { key: 'networks', icon: <Share2 className="size-4.5" />, label: '网络' },
  { key: 'volumes', icon: <Database className="size-4.5" />, label: '存储卷' },
  { key: 'events', icon: <Activity className="size-4.5" />, label: '事件' },
  { key: 'docker', icon: <Settings2 className="size-4.5" />, label: '配置' },
  { key: 'terminal', icon: <Terminal className="size-4.5" />, label: '终端' },
]

const TRANSPARENT_TABS = new Set<WorkspaceTab>(['overview', 'docker'])

interface WorkspaceProps {
  selectedServer: ServerConfig
  onDisconnect: () => void
  activeTab: WorkspaceTab
  onActiveTabChange: (tab: WorkspaceTab) => void
}

export default function Workspace({ selectedServer, onDisconnect, activeTab, onActiveTabChange }: WorkspaceProps) {
  const { status: serverStatus, ok: serverOk, recheck: recheckServer } = useServerConnection(selectedServer.id)
  const {
    status: dockerStatus,
    ok: dockerOk,
    recheck: recheckDocker,
    info: dockerInfo,
  } = useDockerAccess(selectedServer.id, serverOk)

  useRecordServerOs(selectedServer.id, dockerInfo)

  const { events, status: eventStatus, clearEvents } = useDockerEventInvalidation(selectedServer.id, dockerOk)

  useEffect(() => {
    return onWorkspaceNavigate((t: WorkspaceNavigateTarget) => {
      if (t.serverId && t.serverId !== selectedServer.id) return
      onActiveTabChange(t.tab)
    })
  }, [onActiveTabChange, selectedServer.id])

  const handleDisconnect = () => {
    const label = selectedServer.name
    onDisconnect()
    toast.success(`连接 ${label} 已断开`)
  }

  if (serverStatus === 'checking' || (serverOk && dockerStatus === 'checking')) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const showGuide = (!serverOk || !dockerOk) && activeTab !== 'terminal'
  if (showGuide) {
    return (
      <DockerAccessGuide
        status={serverOk ? (dockerStatus as 'no_permission' | 'no_docker' | 'error') : 'server_error'}
        username={selectedServer.username}
        onRetry={() => void (serverOk ? recheckDocker(true) : recheckServer(true))}
        onDisconnect={handleDisconnect}
        onOpenTerminal={() => onActiveTabChange('terminal')}
      />
    )
  }

  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="flex h-full flex-col gap-3">
        <WorkspaceTabs
          items={NAV_ITEMS}
          activeKey={activeTab}
          onChange={onActiveTabChange}
          dockerOk={serverOk && dockerOk}
          alwaysEnabledKeys={['terminal']}
          onDockerRetry={() => void (serverOk ? recheckDocker(true) : recheckServer(true))}
          onDisconnect={handleDisconnect}
        />

        <div
          className={cn(
            'flex min-h-90 flex-1 flex-col overflow-hidden',
            TRANSPARENT_TABS.has(activeTab) ? '' : 'rounded-xl border border-border bg-card'
          )}
          style={TRANSPARENT_TABS.has(activeTab) ? { background: 'transparent' } : undefined}
        >
          {activeTab === 'overview' ? <ServerOverview serverId={selectedServer.id} /> : null}
          {activeTab === 'containers' ? <ContainerPanel serverId={selectedServer.id} /> : null}
          {activeTab === 'images' ? <ImagePanel serverId={selectedServer.id} /> : null}
          {activeTab === 'networks' ? <NetworkPanel serverId={selectedServer.id} /> : null}
          {activeTab === 'volumes' ? <VolumePanel serverId={selectedServer.id} /> : null}
          {activeTab === 'docker' ? <DockerManagePanel serverId={selectedServer.id} /> : null}
          {activeTab === 'events' ? <EventPanel events={events} status={eventStatus} onClear={clearEvents} /> : null}
          <KeepAlive lazy show={activeTab === 'terminal'} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TerminalPanel serverId={selectedServer.id} />
          </KeepAlive>
        </div>
      </div>
    </div>
  )
}
