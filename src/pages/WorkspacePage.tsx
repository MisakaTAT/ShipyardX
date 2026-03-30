import { useState, useEffect } from 'react'
import { Box, Layers, Terminal, Server as ServerIcon, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import type { Server } from '../types'
import ContainerPanel from '../components/ContainerPanel'
import ImagePanel from '../components/ImagePanel'
import TerminalPanel from '../components/TerminalPanel'
import ServerOverview from '../components/ServerOverview'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'containers' | 'images' | 'terminal'

interface NavItem {
  key: Tab
  icon: React.ReactNode
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', icon: <ServerIcon className="size-[18px]" />, label: '概览' },
  { key: 'containers', icon: <Box className="size-[18px]" />, label: '容器' },
  { key: 'images', icon: <Layers className="size-[18px]" />, label: '镜像' },
  { key: 'terminal', icon: <Terminal className="size-[18px]" />, label: '终端' },
]

interface WorkspacePageProps {
  selectedServer: Server
  onDisconnect: () => void
}

export default function WorkspacePage({ selectedServer, onDisconnect }: WorkspacePageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    setActiveTab('overview')
  }, [selectedServer.id])

  const handleDisconnect = () => {
    const label = selectedServer.name
    onDisconnect()
    toast.success(`连接 ${label} 已断开`)
  }

  return (
    <div className="flex-1 overflow-auto p-2 md:p-3">
      <div className="flex h-full flex-col gap-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="flex flex-col gap-3">
          <TabsList
            variant="line"
            className="h-auto w-full flex-wrap justify-start gap-1 overflow-hidden rounded-xl border border-border bg-(--bg-panel) p-1.5"
          >
            {NAV_ITEMS.map((item) => (
              <TabsTrigger key={item.key} value={item.key} className="flex flex-1 sm:flex-none">
                {item.icon}
                {item.label}
              </TabsTrigger>
            ))}

            <div className="ml-auto flex items-center">
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
            'min-h-[360px] flex-1 overflow-hidden',
            activeTab === 'overview' ? '' : 'rounded-xl border border-border bg-(--bg-panel)',
          )}
          style={activeTab === 'overview' ? { background: 'transparent' } : undefined}
        >
          {activeTab === 'overview' ? <ServerOverview serverId={selectedServer.id} /> : null}
          {activeTab === 'containers' ? <ContainerPanel serverId={selectedServer.id} /> : null}
          {activeTab === 'images' ? <ImagePanel serverId={selectedServer.id} /> : null}
          {activeTab === 'terminal' ? (
            <TerminalPanel
              serverId={selectedServer.id}
              serverName={`${selectedServer.username}@${selectedServer.host}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
