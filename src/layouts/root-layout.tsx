import { useState, useEffect } from 'react'
import { Router, useLocation } from 'wouter'
import type { ServerConfig } from '@/types/app-bindings'
import Sider from '@/layouts/sider/sider'
import Connections from '@/pages/connections'
import Workspace, { type WorkspaceTab } from '@/pages/workspace'
import AppStore from '@/pages/app-store'
import PortForward from '@/pages/port-forward'
import HostKeys from '@/pages/host-keys'
import SettingsPage from '@/pages/settings'
import { KeepAlive } from '@/shared/components/keep-alive'
import { CommandPaletteHost } from '@/features/command-palette/ui/command-palette-host'
import { APP_PATHS, appMemoryLocation } from '@/shared/lib/app-router'

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
  const isHostKeys = location === APP_PATHS.hostKeys
  const isWorkspace = location === APP_PATHS.workspace
  const isSettings = location === APP_PATHS.settings

  useEffect(() => {
    setWorkspaceTab('overview')
  }, [selectedServer?.id])

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground select-none">
      <CommandPaletteHost />
      <Sider />

      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        {isStore ? (
          <div className="flex-1 overflow-auto p-3">
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

        {isHostKeys ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <HostKeys />
          </div>
        ) : null}

        {isSettings ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SettingsPage />
          </div>
        ) : null}

        {!selectedServer && isWorkspace ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Connections onConnect={setSelectedServer} />
          </div>
        ) : null}
      </main>
    </div>
  )
}
