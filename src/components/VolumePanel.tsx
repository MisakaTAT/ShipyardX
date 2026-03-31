import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Database, Search, X, Loader2, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { CreateVolumeRequest, DockerVolume } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  const [showCreate, setShowCreate] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createMode, setCreateMode] = useState<'local'>('local')
  const [createEnableNfs, setCreateEnableNfs] = useState(false)
  const [createNfsAddr, setCreateNfsAddr] = useState('')
  const [createNfsVersion, setCreateNfsVersion] = useState('')
  const [createNfsMount, setCreateNfsMount] = useState('')
  const [createNfsOptions, setCreateNfsOptions] = useState('rw,noatime,rsize=8192,wsize=8192,tcp,timeo=14')
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

        <div className="ml-auto flex items-center gap-2">
          {lastUpdated ? (
            <span className="text-xs mr-1" style={{ color: 'var(--text-muted)' }}>
              更新于 {lastUpdated}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setCreateName('')
              setCreateMode('local')
              setCreateEnableNfs(false)
              setCreateNfsAddr('')
              setCreateNfsVersion('')
              setCreateNfsMount('')
              setCreateNfsOptions('rw,noatime,rsize=8192,wsize=8192,tcp,timeo=14')
              setShowCreate(true)
            }}
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            创建存储卷
          </Button>
        </div>
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

      <Dialog
        open={showCreate}
        onOpenChange={(next) => {
          if (!next && !createSubmitting) setShowCreate(false)
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
            <Database className="size-4 text-(--accent-text)" />
            <DialogTitle className="flex-1 text-sm font-semibold text-(--text-strong)">创建存储卷</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
              disabled={createSubmitting}
              onClick={() => setShowCreate(false)}
            >
              <X className="size-4" />
            </Button>
          </DialogHeader>

          <div className="space-y-3 p-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-(--text-muted)">名称 *</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="例如 my-volume"
                disabled={createSubmitting}
                className="border-(--border-sub) bg-(--bg-input) text-sm text-(--text-base)"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-(--text-muted)">模式</label>
              <Select value={createMode} onValueChange={(v) => setCreateMode(v as 'local')} disabled={createSubmitting}>
                <SelectTrigger
                  className="w-full border-(--border-sub) bg-(--bg-input) font-mono text-sm"
                  size="default"
                >
                  <SelectValue placeholder="选择 Driver" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="local">local</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-base)">
              <input
                type="checkbox"
                checked={createEnableNfs}
                disabled={createSubmitting}
                onChange={(e) => setCreateEnableNfs(e.target.checked)}
                className="size-3.5 rounded border-(--border-sub)"
              />
              启用 NFS 存储
            </label>

            {createEnableNfs ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-(--text-muted)">地址 *</label>
                  <Input
                    value={createNfsAddr}
                    onChange={(e) => setCreateNfsAddr(e.target.value)}
                    placeholder="支持输入 IP 或域名，例如 10.0.0.10 或 nfs.example.com"
                    disabled={createSubmitting}
                    className="border-(--border-sub) bg-(--bg-input) font-mono text-sm text-(--text-base)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-(--text-muted)">版本</label>
                    <Input
                      value={createNfsVersion}
                      onChange={(e) => setCreateNfsVersion(e.target.value)}
                      placeholder="例如 4 或 4.1 或 3"
                      disabled={createSubmitting}
                      className="border-(--border-sub) bg-(--bg-input) font-mono text-sm text-(--text-base)"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-(--text-muted)">挂载点 *</label>
                    <Input
                      value={createNfsMount}
                      onChange={(e) => setCreateNfsMount(e.target.value)}
                      placeholder="例如 /nfs 或 /nfs-share"
                      disabled={createSubmitting}
                      className="border-(--border-sub) bg-(--bg-input) font-mono text-sm text-(--text-base)"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-(--text-muted)">可选参数</label>
                  <Input
                    value={createNfsOptions}
                    onChange={(e) => setCreateNfsOptions(e.target.value)}
                    placeholder="rw,noatime,rsize=8192,wsize=8192,tcp,timeo=14"
                    disabled={createSubmitting}
                    className="border-(--border-sub) bg-(--bg-input) font-mono text-sm text-(--text-base)"
                  />
                </div>
              </>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={createSubmitting}
                onClick={() => setShowCreate(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={!createName.trim() || createSubmitting}
                onClick={async () => {
                  setCreateSubmitting(true)
                  try {
                    const driverOpts: Record<string, string> = {}

                    if (createEnableNfs) {
                      const addr = createNfsAddr.trim()
                      const mount = createNfsMount.trim()
                      if (!addr) {
                        toast.error('请填写 NFS 地址')
                        return
                      }
                      if (!mount) {
                        toast.error('请填写 NFS 挂载点')
                        return
                      }

                      const oParts: string[] = []
                      oParts.push(`addr=${addr}`)
                      const ver = createNfsVersion.trim()
                      if (ver) oParts.push(`nfsvers=${ver}`)
                      const opt = createNfsOptions.trim()
                      if (opt) {
                        for (const p of opt
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean))
                          oParts.push(p)
                      }

                      driverOpts.type = 'nfs'
                      driverOpts.o = oParts.join(',')
                      driverOpts.device = `:${mount}`
                    }

                    const req: CreateVolumeRequest = {
                      name: createName.trim(),
                      driver: 'local',
                      driverOpts: Object.keys(driverOpts).length ? driverOpts : null,
                    }
                    await invoke('create_volume', { serverId, ...req })
                    setShowCreate(false)
                    await fetchVolumes()
                  } catch (e) {
                    toast.error(String(e))
                  } finally {
                    setCreateSubmitting(false)
                  }
                }}
              >
                {createSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin stroke-[2.5]" />
                    创建中
                  </>
                ) : (
                  <>
                    <Plus className="size-3.5 stroke-[2.5]" />
                    创建
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
