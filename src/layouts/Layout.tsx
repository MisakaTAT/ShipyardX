import { useState, useEffect } from 'react'
import { Router, useLocation } from 'wouter'
import { Toaster } from '@/components/ui/sonner'
import type { ServerConfig } from '@/types/app-bindings'
import Sider from '@/layouts/Sider'
import Connections from '@/pages/Connections'
import Workspace, { type WorkspaceTab } from '@/pages/Workspace'
import AppStore from '@/pages/AppStore'
import PortForward from '@/pages/PortForward'
import { KeepAlive } from '@/components/common/KeepAlive'
import { APP_PATHS, appMemoryLocation } from '@/lib/appRouter'

export default function Layout() {
  return (
    <Router hook={appMemoryLocation.hook} searchHook={appMemoryLocation.searchHook}>
      <LayoutContent />
    </Router>
  )
}

function LayoutContent() {
  const [location] = useLocation()
  const [selectedServer, setSelectedServer] = useState<ServerConfig | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview')
  const isStore = location === APP_PATHS.store
  const isPortForward = location === APP_PATHS.portForward
  const isWorkspace = location === APP_PATHS.workspace

  useEffect(() => {
    setWorkspaceTab('overview')
  }, [selectedServer?.id])

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground select-none">
      <Sider />

      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        {isStore ? (
          <div className="flex-1 overflow-auto p-2 md:p-3">
            <AppStore />
          </div>
        ) : null}

        {selectedServer ? (
          <KeepAlive show={isWorkspace} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Workspace
              selectedServer={selectedServer}
              onDisconnect={() => setSelectedServer(null)}
              activeTab={workspaceTab}
              onActiveTabChange={setWorkspaceTab}
            />
          </KeepAlive>
        ) : null}

        {isPortForward ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PortForward />
          </div>
        ) : null}

        {!selectedServer && isWorkspace ? <Connections onConnect={setSelectedServer} /> : null}
      </main>

      <Toaster position="bottom-right" />
    </div>
  )
}
