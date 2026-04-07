import { useCallback, useEffect, useRef, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { Share2, Loader2, Trash2, Plus, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { Network } from '@/types/app-bindings'
import NetworkCreateDialog from '@/components/docker/dialogs/NetworkCreateDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import InspectDialog from '@/components/docker/dialogs/InspectDialog'
import { Button } from '@/components/ui/button'
import { PanelToolbar, PanelToolbarHeading, PanelToolbarSearch } from '@/components/ui/panel-toolbar'
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
  const [networks, setNetworks] = useState<Network[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Network | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Network | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchNetworks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await commands.listNetworks(serverId)
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
  }, [fetchNetworks, refreshTick])

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
    <div className="flex h-full flex-col bg-background">
      <PanelToolbar>
        <PanelToolbarHeading
          icon={<Share2 />}
          title="网络"
          meta={networks.length > 0 ? `(${networks.length})` : null}
        />

        <PanelToolbarSearch
          ref={searchRef}
          value={search}
          onValueChange={setSearch}
          placeholder='搜索… ("/" 快速聚焦)'
        />

        <div className="ml-auto flex items-center gap-2">
          {lastUpdated ? <span className="mr-1 text-xs text-muted-foreground">更新于 {lastUpdated}</span> : null}
          <Button type="button" onClick={() => setShowCreate(true)}>
            <Plus />
            创建网络
          </Button>
        </div>
      </PanelToolbar>

      <div className="flex-1 overflow-auto bg-card">
        {loading && networks.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
            <Share2 className="mb-3 h-10 w-10 text-border" />
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
                    <div className="font-medium text-foreground">{n.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{n.id.slice(0, 12)}</div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-muted-foreground">{n.driver || '—'}</TableCell>
                  <TableCell className="px-4 py-3 text-xs text-muted-foreground">{n.scope || '—'}</TableCell>
                  <TableCell className="max-w-[220px] px-4 py-3">
                    <ChipCell items={n.subnets} />
                  </TableCell>
                  <TableCell className="max-w-[220px] px-4 py-3">
                    <ChipCell items={n.gateways} />
                  </TableCell>
                  <TableCell className="max-w-[320px] px-4 py-3">
                    <ChipCell items={n.labels} />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                    {n.internal ? 'internal' : ''}
                    {n.internal && n.attachable ? ' · ' : ''}
                    {n.attachable ? 'attachable' : '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                    <span title={n.created_at || undefined}>{formatDateTimeString(n.created_at)}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghostAccent"
                        icon
                        title="Inspect"
                        onClick={() => setInspectTarget(n)}
                      >
                        <ScanSearch />
                      </Button>
                      <Button type="button" variant="ghostDanger" icon title="删除" onClick={() => setRemoveTarget(n)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableBodyRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <NetworkCreateDialog
        serverId={serverId}
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => void fetchNetworks()}
      />

      {inspectTarget && (
        <InspectDialog
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
            await commands.removeNetwork(serverId, removeTarget.id)
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
    return <span className="font-mono text-xs text-muted-foreground">—</span>
  }

  const full = list.join(', ')

  return (
    <div className="flex flex-wrap gap-1" title={full}>
      {visible.map((item, i) => (
        <span
          key={`${i}-${item}`}
          className="inline-block max-w-[200px] truncate rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {item}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-block rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  )
}
