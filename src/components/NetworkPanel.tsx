import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Share2, Search, X, Loader2, Trash2, Plus, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { DockerNetwork, NetworkCreate } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import InspectModal from './InspectModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableBodyRow,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  dataTableHead,
} from '@/components/ui/table'
import { formatDateTimeString, formatNowTime } from '@/utils/datetime'

interface Props {
  serverId: string
  refreshTick?: number
}

export default function NetworkPanel({ serverId, refreshTick }: Props) {
  const [networks, setNetworks] = useState<DockerNetwork[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<DockerNetwork | null>(null)
  const [inspectTarget, setInspectTarget] = useState<DockerNetwork | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDriver, setCreateDriver] = useState('bridge')
  const [createSubnet, setCreateSubnet] = useState('')
  const [createGateway, setCreateGateway] = useState('')
  const [createInternal, setCreateInternal] = useState(false)
  const [createAttachable, setCreateAttachable] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchNetworks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await invoke<DockerNetwork[]>('list_networks', { serverId })
      setNetworks(data)
      setLastUpdated(formatNowTime())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchNetworks()
  }, [fetchNetworks])

  useEffect(() => {
    if (refreshTick && refreshTick > 0) fetchNetworks()
  }, [refreshTick, fetchNetworks])

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

  const filtered = networks.filter((n) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      n.name.toLowerCase().includes(q) ||
      n.id.toLowerCase().includes(q) ||
      n.driver.toLowerCase().includes(q) ||
      n.scope.toLowerCase().includes(q) ||
      n.created_at.toLowerCase().includes(q) ||
      n.subnets.join(' ').toLowerCase().includes(q) ||
      n.gateways.join(' ').toLowerCase().includes(q) ||
      n.labels.join(' ').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg-app)' }}>
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3"
        style={{ background: 'var(--bg-panel)' }}
      >
        <Share2 className="w-4 h-4 shrink-0" style={{ color: 'var(--text-soft)' }} />
        <span className="text-sm font-medium mr-1" style={{ color: 'var(--text-base)' }}>
          网络
        </span>
        {networks.length > 0 ? (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ({networks.length})
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
              setCreateDriver('bridge')
              setCreateSubnet('')
              setCreateGateway('')
              setCreateInternal(false)
              setCreateAttachable(false)
              setShowCreate(true)
            }}
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            创建网络
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-(--bg-panel)">
        {loading && networks.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
            <Share2 className="w-10 h-10 mb-3" style={{ color: 'var(--border-sub)' }} />
            <p className="text-sm">{search ? `无匹配的网络 \"${search}\"` : '没有网络'}</p>
          </div>
        ) : (
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className={dataTableHead.first}>名称</TableHead>
                <TableHead className={dataTableHead.mid}>Driver</TableHead>
                <TableHead className={dataTableHead.mid}>Scope</TableHead>
                <TableHead className={dataTableHead.mid}>子网</TableHead>
                <TableHead className={dataTableHead.mid}>网关</TableHead>
                <TableHead className={dataTableHead.mid}>标签</TableHead>
                <TableHead className={dataTableHead.mid}>属性</TableHead>
                <TableHead className={dataTableHead.mid}>创建时间</TableHead>
                <TableHead className={dataTableHead.last}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((n) => (
                <TableBodyRow key={n.id}>
                  <TableCell className="px-5 py-3">
                    <div className="font-medium" style={{ color: 'var(--text-strong)' }}>
                      {n.name}
                    </div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {n.id.slice(0, 12)}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                    {n.driver || '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                    {n.scope || '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3 max-w-[220px]">
                    <ChipCell items={n.subnets} />
                  </TableCell>
                  <TableCell className="px-4 py-3 max-w-[220px]">
                    <ChipCell items={n.gateways} />
                  </TableCell>
                  <TableCell className="px-4 py-3 max-w-[320px]">
                    <ChipCell items={n.labels} />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                    {n.internal ? 'internal' : ''}
                    {n.internal && n.attachable ? ' · ' : ''}
                    {n.attachable ? 'attachable' : '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                    <span title={n.created_at || undefined}>{formatDateTimeString(n.created_at)}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Inspect"
                        onClick={() => setInspectTarget(n)}
                        className="rounded-md text-(--text-muted) hover:bg-accent hover:text-accent-foreground"
                      >
                        <ScanSearch className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="删除"
                        onClick={() => setRemoveTarget(n)}
                        className="rounded-lg text-(--text-muted) hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableBodyRow>
              ))}
            </TableBody>
          </Table>
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
            <Share2 className="size-4 text-(--accent-text)" />
            <DialogTitle className="flex-1 text-sm font-semibold text-(--text-strong)">创建网络</DialogTitle>
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
                placeholder="例如 my-net"
                disabled={createSubmitting}
                className="border-(--border-sub) bg-(--bg-input) text-sm text-(--text-base)"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-(--text-muted)">Driver</label>
              <Select value={createDriver} onValueChange={setCreateDriver} disabled={createSubmitting}>
                <SelectTrigger
                  className="w-full border-(--border-sub) bg-(--bg-input) font-mono text-sm"
                  size="default"
                >
                  <SelectValue placeholder="选择 Driver" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="bridge">bridge</SelectItem>
                  <SelectItem value="host">host</SelectItem>
                  <SelectItem value="overlay">overlay</SelectItem>
                  <SelectItem value="macvlan">macvlan</SelectItem>
                  <SelectItem value="ipvlan">ipvlan</SelectItem>
                  <SelectItem value="none">none</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-(--text-muted)">子网（可选）</label>
                <Input
                  value={createSubnet}
                  onChange={(e) => setCreateSubnet(e.target.value)}
                  placeholder="172.28.0.0/16"
                  disabled={createSubmitting}
                  className="border-(--border-sub) bg-(--bg-input) font-mono text-sm text-(--text-base)"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-(--text-muted)">网关（可选）</label>
                <Input
                  value={createGateway}
                  onChange={(e) => setCreateGateway(e.target.value)}
                  placeholder="172.28.0.1"
                  disabled={createSubmitting}
                  className="border-(--border-sub) bg-(--bg-input) font-mono text-sm text-(--text-base)"
                />
              </div>
            </div>
            <p className="text-xs text-(--text-muted)">不填子网时由 Docker 自动分配地址池。</p>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-base)">
                <input
                  type="checkbox"
                  checked={createInternal}
                  disabled={createSubmitting}
                  onChange={(e) => setCreateInternal(e.target.checked)}
                  className="size-3.5 rounded border-(--border-sub)"
                />
                Internal（禁止对外路由）
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-base)">
                <input
                  type="checkbox"
                  checked={createAttachable}
                  disabled={createSubmitting}
                  onChange={(e) => setCreateAttachable(e.target.checked)}
                  className="size-3.5 rounded border-(--border-sub)"
                />
                Attachable（允许其它引擎附加容器）
              </label>
            </div>
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
                    const req: NetworkCreate = {
                      name: createName.trim(),
                      driver: createDriver.trim() || null,
                      subnet: createSubnet.trim() || null,
                      gateway: createGateway.trim() || null,
                      internal: createInternal,
                      attachable: createAttachable,
                    }
                    await invoke('create_network', { server_id: serverId, ...req })
                    setShowCreate(false)
                    await fetchNetworks()
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

      {inspectTarget && (
        <InspectModal
          serverId={serverId}
          kind="network"
          targetId={inspectTarget.id}
          targetLabel={inspectTarget.name}
          onClose={() => setInspectTarget(null)}
        />
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="删除网络"
        description={removeTarget ? `确认删除网络「${removeTarget.name}」？\n\n若仍有容器连接该网络，删除会失败。` : ''}
        confirmText="删除"
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await invoke('remove_network', { serverId, networkId: removeTarget.id })
            await fetchNetworks()
          } catch (e) {
            toast.error(String(e))
          }
        }}
      />
    </div>
  )
}

function ChipCell({ items }: { items: string[] }) {
  const list = items.map((s) => s.trim()).filter(Boolean)
  const visible = list.slice(0, 2)
  const hiddenCount = list.length - visible.length

  if (list.length === 0) {
    return (
      <span className="text-xs font-mono" style={{ color: 'var(--text-soft)' }}>
        —
      </span>
    )
  }

  const full = list.join(', ')

  return (
    <div className="flex flex-wrap gap-1" title={full}>
      {visible.map((item, i) => (
        <span
          key={`${i}-${item}`}
          className="inline-block max-w-[200px] truncate px-1.5 py-0.5 rounded border text-[10px] font-mono"
          style={{
            color: 'var(--text-soft)',
            borderColor: 'var(--border-sub)',
            background: 'var(--bg-surface)',
          }}
        >
          {item}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span
          className="inline-block px-1.5 py-0.5 rounded border text-[10px]"
          style={{
            color: 'var(--text-muted)',
            borderColor: 'var(--border-sub)',
            background: 'var(--bg-surface)',
          }}
        >
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  )
}
