import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { Share2, Trash2, Plus, ScanSearch, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Network } from '@/types/app-bindings'
import NetworkCreateDialog from '@/features/docker/network/NetworkCreateDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import ResourceInspectDialog from '@/features/docker/shared/ResourceInspectDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTimeString, formatNowTime } from '@/utils/datetime'

interface Props {
  serverId: string
  refreshTick?: number
}
type DataTableColumn<T extends object> = {
  key: string
  title: React.ReactNode
  render?: (value: unknown, record: T, index: number) => React.ReactNode
  colWidth?: string
  truncate?: boolean
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

  const networkColumns = useMemo<DataTableColumn<Network>[]>(
    () => [
      {
        key: 'name',
        title: '名称',
        render: (_, n) => (
          <>
            <div className="font-medium text-foreground">{n.name}</div>
            <div className="text-muted-foreground">{n.id.slice(0, 12)}</div>
          </>
        ),
      },
      {
        key: 'driver',
        title: 'Driver',
        render: (_, n) => n.driver || '—',
      },
      {
        key: 'scope',
        title: 'Scope',
        render: (_, n) => n.scope || '—',
      },
      {
        key: 'subnets',
        title: '子网',
        render: (_, n) => <ChipCell items={n.subnets} />,
      },
      {
        key: 'gateways',
        title: '网关',
        render: (_, n) => <ChipCell items={n.gateways} />,
      },
      {
        key: 'labels',
        title: '标签',
        colWidth: '16rem',
        truncate: false,
        render: (_, n) => <ChipCell items={n.labels} />,
      },
      {
        key: 'attrs',
        title: '属性',
        render: (_, n) => (
          <>
            {n.internal ? 'internal' : ''}
            {n.internal && n.attachable ? ' · ' : ''}
            {n.attachable ? 'attachable' : '—'}
          </>
        ),
      },
      {
        key: 'created',
        title: '创建时间',
        render: (_, n) => <span title={n.created_at || undefined}>{formatDateTimeString(n.created_at)}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        colWidth: '5rem',
        render: (_, n) => (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Inspect"
              onClick={() => setInspectTarget(n)}
              className="rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ScanSearch />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="删除"
              onClick={() => setRemoveTarget(n)}
              className="rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],

    []
  )

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-4">
        <div className="inline-flex items-center gap-2.5">
          <div className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground [&_svg]:size-4">
            <Share2 />
          </div>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span>网络</span>
            {networks.length > 0 ? (
              <span className="font-normal text-muted-foreground">({networks.length})</span>
            ) : null}
          </div>
        </div>
        <div className="relative ml-4 w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索… ("/" 快速聚焦)'
            className="w-full pl-9"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {lastUpdated ? <span className="mr-1 text-xs text-muted-foreground">更新于 {lastUpdated}</span> : null}
          <Button type="button" onClick={() => setShowCreate(true)}>
            <Plus />
            创建网络
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-card">
        {loading && networks.length === 0 ? (
          <div className="flex h-full min-h-48 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <div className="flex justify-center text-border [&_svg]:size-7">
              <Share2 />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{search ? `无匹配的网络 \"${search}\"` : '没有网络'}</p>
          </div>
        ) : (
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow>
                {networkColumns.map((col) => (
                  <TableHead key={col.key} style={col.colWidth ? { width: col.colWidth } : undefined}>
                    {col.title}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, idx) => (
                <TableRow key={row.id}>
                  {networkColumns.map((col) => (
                    <TableCell key={col.key} className={col.truncate === false ? 'whitespace-normal' : undefined}>
                      {col.render ? col.render(undefined, row, idx) : null}
                    </TableCell>
                  ))}
                </TableRow>
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
        <ResourceInspectDialog
          serverId={serverId}
          kind="network"
          targetId={inspectTarget.id}
          targetLabel={inspectTarget.name}
          onClose={() => setInspectTarget(null)}
        />
      )}

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除网络</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {removeTarget ? `确认删除网络「${removeTarget.name}」？\n\n若仍有容器连接该网络，删除会失败。` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!removeTarget) return
                void (async () => {
                  try {
                    await commands.removeNetwork(serverId, removeTarget.id)
                    await fetchNetworks()
                  } catch (err) {
                    toast.error(String(err))
                  } finally {
                    setRemoveTarget(null)
                  }
                })()
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
