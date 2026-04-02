import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import type { Server } from '@/types'
import Sider from '@/layouts/Sider'
import Connections from '@/pages/Connections'
import Workspace from '@/pages/Workspace'
import AppStore from '@/pages/AppStore'
import PortForward from '@/pages/PortForward'

export default function Layout() {
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [activeView, setActiveView] = useState<'workspace' | 'port_forward' | 'store'>('workspace')
  const [light, setLight] = useState(() => localStorage.getItem('theme') === 'light')

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

  return (
    <div
      className="flex h-screen overflow-hidden select-none"
      style={{ background: 'var(--bg-app)', color: 'var(--text-base)' }}
    >
      <Sider light={light} activeView={activeView} onChangeView={setActiveView} onToggleTheme={toggleTheme} />

      <main className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
        {activeView === 'store' ? (
          <div className="flex-1 overflow-auto p-2 md:p-3">
            <AppStore />
          </div>
        ) : activeView === 'port_forward' ? (
          <PortForward />
        ) : selectedServer ? (
          <Workspace selectedServer={selectedServer} onDisconnect={() => setSelectedServer(null)} />
        ) : (
          <Connections onConnect={setSelectedServer} />
        )}
      </main>

      <Toaster position="bottom-right" />
    </div>
  )
}
