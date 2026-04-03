import { useState, useEffect } from 'react'
import { Router, useLocation } from 'wouter'
import { Toaster } from '@/components/ui/sonner'
import type { Server } from '@/types'
import Sider from '@/layouts/Sider'
import Connections from '@/pages/Connections'
import Workspace, { type WorkspaceTab } from '@/pages/Workspace'
import AppStore from '@/pages/AppStore'
import PortForward from '@/pages/PortForward'
import { KeepAlive } from '@/components/KeepAlive'
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
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview')
  const [light, setLight] = useState(() => localStorage.getItem('theme') === 'light')

  const isStore = location === APP_PATHS.store
  const isPortForward = location === APP_PATHS.portForward
  const isWorkspace = location === APP_PATHS.workspace

  useEffect(() => {
    const root = document.documentElement
    if (light) {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    } else {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    }
  }, [light])

  const toggleTheme = () => setLight((v) => !v)

  useEffect(() => {
    setWorkspaceTab('overview')
  }, [selectedServer?.id])

  return (
    <div
      className="flex h-screen overflow-hidden select-none"
      style={{ background: 'var(--bg-app)', color: 'var(--text-base)' }}
    >
      <Sider light={light} onToggleTheme={toggleTheme} />

      <main className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
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
