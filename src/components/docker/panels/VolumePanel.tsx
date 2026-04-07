import { useCallback, useEffect, useRef, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { Database, Loader2, Trash2, Plus, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { Volume } from '@/types/app-bindings'
import VolumeCreateDialog from '@/components/docker/dialogs/VolumeCreateDialog'
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

  return (
    <div className="flex h-full flex-col bg-background">
      <PanelToolbar>
        <PanelToolbarHeading
          icon={<Database />}
          title="存储卷"
          meta={volumes.length > 0 ? `(${volumes.length})` : null}
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
            创建存储卷
          </Button>
        </div>
      </PanelToolbar>

      <div className="flex-1 overflow-auto bg-card">
        {loading && volumes.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
            <Database className="mb-3 h-10 w-10 text-border" />
            <p className="text-sm">{search ? `无匹配的存储卷 \"${search}\"` : '没有存储卷'}</p>
          </div>
        ) : (
          <Table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '40%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className={dataTableHead.first}>名称</TableHead>
                <TableHead className={dataTableHead.mid}>Driver</TableHead>
                <TableHead className={dataTableHead.mid}>Scope</TableHead>
                <TableHead className={dataTableHead.mid}>Mountpoint</TableHead>
                <TableHead className={dataTableHead.mid}>创建时间</TableHead>
                <TableHead className={dataTableHead.last}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <TableBodyRow key={v.name}>
                  <TableCell className="min-w-0 px-5 py-3">
                    <span className="block truncate font-medium text-foreground" title={v.name}>
                      {v.name}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-muted-foreground">{v.driver || '—'}</TableCell>
                  <TableCell className="px-4 py-3 text-xs text-muted-foreground">{v.scope || '—'}</TableCell>
                  <TableCell className="min-w-0 px-4 py-3">
                    <span className="block truncate font-mono text-xs text-muted-foreground" title={v.mountpoint}>
                      {v.mountpoint || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                    <span title={v.created_at || undefined}>{formatDateTimeString(v.created_at)}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghostAccent"
                        icon
                        title="Inspect"
                        onClick={() => setInspectTarget(v)}
                      >
                        <ScanSearch />
                      </Button>
                      <Button type="button" variant="ghostDanger" icon title="删除" onClick={() => setRemoveTarget(v)}>
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
            await commands.removeVolume(serverId, removeTarget.name)
            await fetchVolumes()
          } catch (e) {
            toast.error(String(e))
          }
        }}
      />
    </div>
  )
}
