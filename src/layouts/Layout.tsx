import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Server } from '../types'
import Sider from './Sider'
import ServerModal from '../components/ServerModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import ConnectPage from '../pages/ConnectPage'
import WorkspacePage from '../pages/WorkspacePage'

type Tab = 'overview' | 'containers' | 'images' | 'terminal'
type Page = 'connect' | 'workspace'

export default function Layout() {
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [page, setPage] = useState<Page>('connect')
  const [showModal, setShowModal] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null)
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

  useEffect(() => {
    invoke<Server[]>('get_servers').then(setServers).catch(console.error)
  }, [])

  const handleSave = (updated: Server[]) => {
    setServers(updated)
    if (editingServer) {
      const refreshed = updated.find((s) => s.id === editingServer.id)
      if (refreshed) setSelectedServer(refreshed)
    }
  }

  const handleEdit = (server: Server) => {
    setEditingServer(server)
    setShowModal(true)
  }
  const handleAdd = () => {
    setEditingServer(null)
    setShowModal(true)
  }

  const handleDeleteRequest = (id: string) => setDeleteServerId(id)

  const executeDeleteServer = async () => {
    const id = deleteServerId
    if (!id) return
    try {
      const updated = await invoke<Server[]>('delete_server', { id })
      setServers(updated)
      if (selectedServer?.id === id) {
        setSelectedServer(null)
        setPage('connect')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleConnect = (server: Server) => {
    setSelectedServer(server)
    setActiveTab('overview')
    setPage('workspace')
  }

  const toggleTheme = () => setLight((v) => !v)

  return (
    <div
      className="flex h-screen overflow-hidden select-none"
      style={{ background: 'var(--bg-app)', color: 'var(--text-base)' }}
    >
      <Sider
        page={page}
        hasSelectedServer={!!selectedServer}
        light={light}
        onPageChange={setPage}
        onToggleTheme={toggleTheme}
      />

      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
        {page === 'connect' || !selectedServer ? (
          <ConnectPage
            servers={servers}
            onConnect={handleConnect}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
          />
        ) : (
          <WorkspacePage selectedServer={selectedServer} activeTab={activeTab} onSelectTab={setActiveTab} />
        )}
      </main>

      <ServerModal
        open={showModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowModal(false)
            setEditingServer(null)
          }
        }}
        server={editingServer}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={deleteServerId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteServerId(null)
        }}
        title="删除服务器"
        description="确定要删除此服务器配置吗？此操作不可撤销。"
        confirmText="删除"
        onConfirm={executeDeleteServer}
      />
    </div>
  )
}
