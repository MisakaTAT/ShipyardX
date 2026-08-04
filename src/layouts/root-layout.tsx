import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react'
import { Router, useLocation } from 'wouter'
import { Loader2 } from 'lucide-react'
import type { ServerConfig } from '@/types/app-bindings'
import Sider from '@/layouts/sider/sider'
import Connections from '@/pages/connections'
import type { WorkspaceTab } from '@/pages/workspace'
import { KeepAlive } from '@/shared/components/keep-alive'
import { CommandPaletteHost } from '@/features/command-palette/ui/command-palette-host'
import { APP_PATHS, appMemoryLocation } from '@/shared/lib/app-router'

const Workspace = lazy(() => import('@/pages/workspace'))
const AppStore = lazy(() => import('@/pages/app-store'))
const PortForward = lazy(() => import('@/pages/port-forward'))
const HostKeys = lazy(() => import('@/pages/host-keys'))
const SettingsPage = lazy(() => import('@/pages/settings'))

function PageFallback() {
  return (
    <div className="flex h-full min-h-48 flex-1 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

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
            <LazyPage>
              <AppStore />
            </LazyPage>
          </div>
        ) : null}

        {selectedServer ? (
          <KeepAlive show={isWorkspace} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <LazyPage>
              <Workspace
                selectedServer={selectedServer}
                onDisconnect={() => setSelectedServer(null)}
                activeTab={workspaceTab}
                onActiveTabChange={setWorkspaceTab}
              />
            </LazyPage>
          </KeepAlive>
        ) : null}

        {isPortForward ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <LazyPage>
              <PortForward />
            </LazyPage>
          </div>
        ) : null}

        {isHostKeys ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <LazyPage>
              <HostKeys />
            </LazyPage>
          </div>
        ) : null}

        {isSettings ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <LazyPage>
              <SettingsPage />
            </LazyPage>
          </div>
        ) : null}

        {!selectedServer && isWorkspace ? <Connections onConnect={setSelectedServer} /> : null}
      </main>
    </div>
  )
}
