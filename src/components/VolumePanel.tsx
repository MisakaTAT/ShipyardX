import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Database, Search, X, Loader2, Trash2 } from 'lucide-react'
import type { DockerVolume } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatDateTimeString } from '@/utils/datetime'

interface Props {
  serverId: string
}

export default function VolumePanel({ serverId }: Props) {
  const [volumes, setVolumes] = useState<DockerVolume[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<DockerVolume | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchVolumes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await invoke<DockerVolume[]>('list_volumes', { serverId })
      setVolumes(data)
      setLastUpdated(new Date().toLocaleTimeString('zh-CN'))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchVolumes()
  }, [fetchVolumes])

  useEffect(() => {
    const intervalId = setInterval(fetchVolumes, 5000)
    return () => clearInterval(intervalId)
  }, [fetchVolumes])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const filtered = volumes.filter((v) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      v.name.toLowerCase().includes(q) ||
      v.driver.toLowerCase().includes(q) ||
      v.scope.toLowerCase().includes(q) ||
      v.mountpoint.toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg-app)' }}>
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3"
        style={{ background: 'var(--bg-panel)' }}
      >
        <Database className="w-4 h-4 shrink-0" style={{ color: 'var(--text-soft)' }} />
        <span className="text-sm font-medium mr-1" style={{ color: 'var(--text-base)' }}>
          存储卷
        </span>
        {volumes.length > 0 ? (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ({volumes.length})
          </span>
        ) : null}

        <div className="relative ml-2">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索… ("/" 快速聚焦)'
            className="h-8 w-52 border-(--border-sub) bg-(--bg-input) pr-8 pl-8 text-xs text-(--text-base)"
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-(--text-muted)"
              onClick={() => setSearch('')}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>

        {lastUpdated ? (
          <div className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
            更新于 {lastUpdated}
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert
          variant="destructive"
          className="mx-5 mt-3 border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-500"
        >
          <AlertDescription className="flex items-start gap-2 text-red-500">
            <span className="flex-1">{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-red-400 hover:bg-transparent hover:text-red-300"
              onClick={() => setError('')}
            >
              <X className="size-3" />
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex-1 overflow-auto">
        {loading && volumes.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
            <Database className="w-10 h-10 mb-3" style={{ color: 'var(--border-sub)' }} />
            <p className="text-sm">{search ? `无匹配的存储卷 \"${search}\"` : '没有存储卷'}</p>
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 z-10 backdrop-blur-sm" style={{ background: 'var(--bg-panel)' }}>
              <tr className="border-b border-border">
                <th
                  className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  名称
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Driver
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Scope
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Mountpoint
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  创建时间
                </th>
                <th
                  className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr
                  key={v.name}
                  className="border-b border-border transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-5 py-3 min-w-0">
                    <span className="block truncate font-medium" style={{ color: 'var(--text-strong)' }} title={v.name}>
                      {v.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                    {v.driver || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                    {v.scope || '—'}
                  </td>
                  <td className="px-4 py-3 min-w-0">
                    <span
                      className="block truncate font-mono text-xs"
                      style={{ color: 'var(--text-muted)' }}
                      title={v.mountpoint}
                    >
                      {v.mountpoint || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                    <span title={v.created_at || undefined}>{formatDateTimeString(v.created_at)}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="删除"
                        onClick={() => setRemoveTarget(v)}
                        className="rounded-lg text-(--text-muted) hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="删除存储卷"
        description={
          removeTarget ? `确认删除存储卷「${removeTarget.name}」？\n\n若仍有容器正在使用该卷，删除会失败。` : ''
        }
        confirmText="删除"
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await invoke('remove_volume', { serverId, name: removeTarget.name })
            await fetchVolumes()
          } catch (e) {
            setError(String(e))
          }
        }}
      />
    </div>
  )
}
