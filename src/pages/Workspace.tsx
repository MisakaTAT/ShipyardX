import { useState, useEffect, useCallback, useRef } from 'react'
import { checkDockerAccess } from '@/lib/commands'
import {
  Activity,
  Box,
  Layers,
  Terminal,
  Server as ServerIcon,
  Unplug,
  ShieldAlert,
  RefreshCw,
  Loader2,
  Share2,
  Database,
  Settings2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Server } from '@/types'
import ContainerPanel from '@/components/ContainerPanel'
import ImagePanel from '@/components/ImagePanel'
import NetworkPanel from '@/components/NetworkPanel'
import TerminalPanel from '@/components/TerminalPanel'
import ServerOverview from '@/components/ServerOverview'
import VolumePanel from '@/components/VolumePanel'
import DockerManagePanel from '@/components/DockerManagePanel'
import EventPanel from '@/components/EventPanel'
import { useDockerEvents } from '@/lib/useDockerEvents'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KeepAlive } from '@/components/KeepAlive'
import { cn } from '@/lib/utils'

export type WorkspaceTab =
  | 'overview'
  | 'containers'
  | 'images'
  | 'networks'
  | 'volumes'
  | 'docker'
  | 'events'
  | 'terminal'
type DockerStatus = 'checking' | 'ok' | 'no_permission' | 'no_docker' | 'error'

interface NavItem {
  key: WorkspaceTab
  icon: React.ReactNode
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', icon: <ServerIcon className="size-[18px]" />, label: '概览' },
  { key: 'containers', icon: <Box className="size-[18px]" />, label: '容器' },
  { key: 'images', icon: <Layers className="size-[18px]" />, label: '镜像' },
  { key: 'networks', icon: <Share2 className="size-[18px]" />, label: '网络' },
  { key: 'volumes', icon: <Database className="size-[18px]" />, label: '存储卷' },
  { key: 'events', icon: <Activity className="size-[18px]" />, label: '事件' },
  { key: 'docker', icon: <Settings2 className="size-[18px]" />, label: '配置' },
  { key: 'terminal', icon: <Terminal className="size-[18px]" />, label: '终端' },
]

interface WorkspaceProps {
  selectedServer: Server
  onDisconnect: () => void
  activeTab: WorkspaceTab
  onActiveTabChange: (tab: WorkspaceTab) => void
}

export default function Workspace({ selectedServer, onDisconnect, activeTab, onActiveTabChange }: WorkspaceProps) {
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>('checking')
  const [refreshTick, setRefreshTick] = useState(0)
  const refreshTypesRef = useRef<Set<string>>(new Set())

  const checkDocker = useCallback(
    async (notify = false) => {
      setDockerStatus('checking')
      try {
        await checkDockerAccess({ serverId: selectedServer.id })
        setDockerStatus('ok')
        if (notify) toast.success('Docker 连接正常')
      } catch (e) {
        const msg = String(e)
        if (msg.includes('no_permission')) {
          setDockerStatus('no_permission')
          if (notify) toast.error('权限不足，请将用户加入 docker 组')
        } else if (msg.includes('no_docker')) {
          setDockerStatus('no_docker')
          if (notify) toast.error('Docker 未安装或未运行')
        } else {
          setDockerStatus('error')
          if (notify) toast.error('无法连接 Docker')
        }
      }
    },
    [selectedServer.id],
  )

  const dockerOk = dockerStatus === 'ok'

  const handleRefresh = useCallback((eventType: string) => {
    refreshTypesRef.current.add(eventType)
    setRefreshTick((t) => t + 1)
  }, [])

  const {
    events,
    status: eventStatus,
    clearEvents,
  } = useDockerEvents({
    serverId: selectedServer.id,
    enabled: dockerOk,
    onRefresh: handleRefresh,
  })

  useEffect(() => {
    checkDocker()
  }, [selectedServer.id, checkDocker])

  const handleDisconnect = () => {
    const label = selectedServer.name
    onDisconnect()
    toast.success(`连接 ${label} 已断开`)
  }

  if (dockerStatus === 'checking') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-(--text-muted)" />
      </div>
    )
  }

  const showGuide = !dockerOk && activeTab !== 'terminal'

  if (showGuide) {
    return (
      <DockerAccessGuide
        status={dockerStatus as 'no_permission' | 'no_docker' | 'error'}
        username={selectedServer.username}
        onRetry={() => checkDocker(true)}
        onDisconnect={handleDisconnect}
        onOpenTerminal={() => onActiveTabChange('terminal')}
      />
    )
  }

  return (
    <div className="flex-1 overflow-auto p-2 md:p-3">
      <div className="flex h-full flex-col gap-3">
        <Tabs
          value={activeTab}
          onValueChange={(v) => onActiveTabChange(v as WorkspaceTab)}
          className="flex flex-col gap-3"
        >
          <TabsList
            variant="line"
            className="h-auto w-full flex-wrap justify-start gap-1 overflow-hidden rounded-xl border border-border bg-(--bg-panel) p-1.5"
          >
            {NAV_ITEMS.map((item) => (
              <TabsTrigger
                key={item.key}
                value={item.key}
                disabled={!dockerOk && item.key !== 'terminal'}
                className="flex flex-1 sm:flex-none"
              >
                {item.icon}
                {item.label}
              </TabsTrigger>
            ))}

            <div className="ml-auto flex items-center gap-1">
              {!dockerOk ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-full  hover:bg-amber-500/15 hover:text-amber-500"
                  title="重新检测 Docker"
                  onClick={() => checkDocker(true)}
                >
                  <RefreshCw className="size-[18px]" />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 rounded-full text-(--text-muted) hover:bg-red-500/15 hover:text-red-500"
                title="断开连接"
                onClick={handleDisconnect}
              >
                <Unplug className="size-[18px]" />
              </Button>
            </div>
          </TabsList>
        </Tabs>

        <div
          className={cn(
            'flex min-h-[360px] flex-1 flex-col overflow-hidden',
            activeTab === 'overview' || activeTab === 'docker' ? '' : 'rounded-xl border border-border bg-(--bg-panel)',
          )}
          style={activeTab === 'overview' || activeTab === 'docker' ? { background: 'transparent' } : undefined}
        >
          {activeTab === 'overview' ? <ServerOverview serverId={selectedServer.id} refreshTick={refreshTick} /> : null}
          {activeTab === 'containers' ? (
            <ContainerPanel serverId={selectedServer.id} refreshTick={refreshTick} />
          ) : null}
          {activeTab === 'images' ? <ImagePanel serverId={selectedServer.id} refreshTick={refreshTick} /> : null}
          {activeTab === 'networks' ? <NetworkPanel serverId={selectedServer.id} refreshTick={refreshTick} /> : null}
          {activeTab === 'volumes' ? <VolumePanel serverId={selectedServer.id} refreshTick={refreshTick} /> : null}
          {activeTab === 'docker' ? <DockerManagePanel serverId={selectedServer.id} /> : null}
          {activeTab === 'events' ? <EventPanel events={events} status={eventStatus} onClear={clearEvents} /> : null}
          <KeepAlive lazy show={activeTab === 'terminal'} className="min-h-0 flex-1 flex flex-col overflow-hidden">
            <TerminalPanel serverId={selectedServer.id} />
          </KeepAlive>
        </div>
      </div>
    </div>
  )
}

function DockerAccessGuide({
  status,
  username,
  onRetry,
  onDisconnect,
  onOpenTerminal,
}: {
  status: 'no_permission' | 'no_docker' | 'error'
  username: string
  onRetry: () => void
  onDisconnect: () => void
  onOpenTerminal: () => void
}) {
  const isPermission = status === 'no_permission'
  const isNoDocker = status === 'no_docker'

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10">
            <ShieldAlert className="size-7 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-(--text-strong)">
            {isPermission ? 'Docker 权限不足' : isNoDocker ? 'Docker 未就绪' : '无法连接 Docker'}
          </h2>
          <p className="text-sm text-(--text-soft)">
            {isPermission
              ? `当前用户 ${username} 没有访问 Docker socket 的权限，请将该用户加入 docker 用户组。`
              : isNoDocker
                ? '目标服务器上未找到 Docker socket，请确认 Docker 已安装并正在运行。'
                : '无法连接到远程 Docker 服务，请检查服务器状态。'}
          </p>
        </div>

        {isPermission ? (
          <div className="space-y-3 rounded-xl border border-border bg-(--bg-panel) p-4">
            <p className="text-xs font-medium text-(--text-base)">按以下步骤配置：</p>
            <div className="space-y-2.5">
              <Step index={1} title="将用户加入 docker 组">
                <Code>{`sudo usermod -aG docker ${username}`}</Code>
              </Step>
              <Step index={2} title="重新登录使组变更生效">
                <Code>newgrp docker</Code>
              </Step>
              <Step index={3} title="验证权限">
                <Code>docker info</Code>
              </Step>
            </div>
          </div>
        ) : isNoDocker ? (
          <div className="space-y-3 rounded-xl border border-border bg-(--bg-panel) p-4">
            <p className="text-xs font-medium text-(--text-base)">可能的原因与解决方式：</p>
            <div className="space-y-2.5">
              <Step index={1} title="Docker 未安装">
                <Code>curl -fsSL https://get.docker.com | sh</Code>
              </Step>
              <Step index={2} title="Docker 服务未启动">
                <Code>sudo systemctl start docker</Code>
              </Step>
              <Step index={3} title="设置开机自启">
                <Code>sudo systemctl enable docker</Code>
              </Step>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={onDisconnect}>
            <Unplug className="size-3.5" />
            断开连接
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenTerminal}>
            <Terminal className="size-3.5" />
            打开终端
          </Button>
          <Button size="sm" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            重新检测
          </Button>
        </div>
      </div>
    </div>
  )
}

function Step({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--accent)/15 text-[11px] font-semibold text-(--accent-text)">
        {index}
      </span>
      <div className="flex-1">
        <p className="text-xs font-medium text-(--text-soft)">{title}</p>
        {children}
      </div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-1 rounded-lg bg-(--bg-surface) px-3 py-2 font-mono text-xs text-(--text-base)">{children}</pre>
  )
}
