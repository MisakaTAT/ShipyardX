import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import type { Server } from '../types'
import Sider from './Sider'
import ConnectPage from '../pages/ConnectPage'
import WorkspacePage from '../pages/WorkspacePage'

export default function Layout() {
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
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
      <Sider
        light={light}
        connectedServerName={selectedServer?.name ?? null}
        onDisconnect={() => setSelectedServer(null)}
        onToggleTheme={toggleTheme}
      />

      <main className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
        {selectedServer ? (
          <WorkspacePage selectedServer={selectedServer} />
        ) : (
          <ConnectPage onConnect={setSelectedServer} />
        )}
      </main>

      <Toaster position="bottom-right" />
    </div>
  )
}
