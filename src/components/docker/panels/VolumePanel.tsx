import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { Database, Trash2, Plus, ScanSearch, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Volume } from '@/types/app-bindings'
import VolumeCreateDialog from '@/components/docker/dialogs/VolumeCreateDialog'
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
import InspectDialog from '@/components/docker/dialogs/InspectDialog'
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
}

export default function VolumePanel({ serverId, refreshTick }: Props) {
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Volume | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Volume | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchVolumes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await commands.listVolumes(serverId)
      setVolumes(data)
      setLastUpdated(formatNowTime())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchVolumes()
  }, [fetchVolumes, refreshTick])

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

  const volumeColumns = useMemo<DataTableColumn<Volume>[]>(
    () => [
      {
        key: 'name',
        title: '名称',
        colWidth: '16rem',
        render: (_, v) => (
          <span className="font-medium text-foreground" title={v.name}>
            {v.name}
          </span>
        ),
      },
      {
        key: 'driver',
        title: 'Driver',
        colWidth: '6rem',
        render: (_, v) => v.driver || '—',
      },
      {
        key: 'scope',
        title: 'Scope',
        colWidth: '6rem',
        render: (_, v) => v.scope || '—',
      },
      {
        key: 'created',
        title: '创建时间',
        colWidth: '10rem',
        render: (_, v) => <span title={v.created_at || undefined}>{formatDateTimeString(v.created_at)}</span>,
      },
      {
        key: 'mountpoint',
        title: 'Mountpoint',
        render: (_, v) => <span title={v.mountpoint}>{v.mountpoint || '—'}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        colWidth: '5rem',
        render: (_, v) => (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Inspect"
              onClick={() => setInspectTarget(v)}
              className="rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ScanSearch />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="删除"
              onClick={() => setRemoveTarget(v)}
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
            <Database />
          </div>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span>存储卷</span>
            {volumes.length > 0 ? <span className="font-normal text-muted-foreground">({volumes.length})</span> : null}
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
            创建存储卷
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-card">
        {loading && volumes.length === 0 ? (
          <div className="flex h-full min-h-48 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <div className="flex justify-center text-border [&_svg]:size-7">
              <Database />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {search ? `无匹配的存储卷 \"${search}\"` : '没有存储卷'}
            </p>
          </div>
        ) : (
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                {volumeColumns.map((col) => (
                  <TableHead key={col.key} style={col.colWidth ? { width: col.colWidth } : undefined}>
                    {col.title}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, idx) => (
                <TableRow key={row.name}>
                  {volumeColumns.map((col) => (
                    <TableCell key={col.key}>{col.render ? col.render(undefined, row, idx) : null}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <VolumeCreateDialog
        serverId={serverId}
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => void fetchVolumes()}
      />

      {inspectTarget && (
        <InspectDialog
          serverId={serverId}
          kind="volume"
          targetId={inspectTarget.name}
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
            <AlertDialogTitle>删除存储卷</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {removeTarget ? `确认删除存储卷「${removeTarget.name}」？\n\n若仍有容器正在使用该卷，删除会失败。` : ''}
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
                    await commands.removeVolume(serverId, removeTarget.name)
                    await fetchVolumes()
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
