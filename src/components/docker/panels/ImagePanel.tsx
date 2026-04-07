import { useState, useEffect, useCallback, useRef } from 'react'
import { commands } from '@/types/app-bindings'
import ImagePullDialog from '@/components/docker/dialogs/ImagePullDialog'
import { Trash2, Download, Image as ImageIcon, Loader2, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { Image } from '@/types/app-bindings'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PanelToolbar, PanelToolbarHeading, PanelToolbarSearch } from '@/components/ui/panel-toolbar'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import InspectDialog from '@/components/docker/dialogs/InspectDialog'
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
import { formatNowTime, formatUnixSeconds } from '@/utils/datetime'

interface ImagePanelProps {
  serverId: string
  refreshTick?: number
}

export default function ImagePanel({ serverId, refreshTick }: ImagePanelProps) {
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(false)
  const [showPull, setShowPull] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Image | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Image | null>(null)
  const [removeForce, setRemoveForce] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchImages = useCallback(async () => {
    setLoading(true)
    try {
      const data = await commands.listImages(serverId)
      setImages(data)
      setLastUpdated(formatNowTime())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchImages()
  }, [fetchImages, refreshTick])

  useEffect(() => {
    setRemoveForce(false)
  }, [removeTarget?.id])

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

  const imageRefLabel = (img: Image) => (img.tag !== '<none>' ? `${img.repository}:${img.tag}` : img.id)

  const removeImageDescription =
    removeTarget == null
      ? ''
      : `确认删除镜像「${imageRefLabel(removeTarget)}」？\n\n默认情况下，若仍有容器使用该镜像，删除会失败。可勾选强制删除以解除引用并删除（可能影响运行中的容器，请谨慎）。`

  const filtered = images.filter((img) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      img.repository.toLowerCase().includes(q) || img.tag.toLowerCase().includes(q) || img.id.toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex h-full flex-col bg-background">
      <PanelToolbar>
        <PanelToolbarHeading icon={<ImageIcon />} title="镜像" meta={images.length > 0 ? `(${images.length})` : null} />

        <PanelToolbarSearch
          ref={searchRef}
          value={search}
          onValueChange={setSearch}
          placeholder='搜索… ("/" 快速聚焦)'
        />

        <div className="ml-auto flex items-center gap-2">
          {lastUpdated ? <span className="mr-1 text-xs text-muted-foreground">更新于 {lastUpdated}</span> : null}
          <Button type="button" onClick={() => setShowPull(true)}>
            <Download />
            拉取镜像
          </Button>
        </div>
      </PanelToolbar>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-card">
        {loading && images.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="mb-3 h-10 w-10 text-border" />
            <p className="text-sm">{search ? `无匹配的镜像 "${search}"` : '没有镜像'}</p>
          </div>
        ) : (
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className={dataTableHead.first}>仓库</TableHead>
                <TableHead className={dataTableHead.mid}>标签</TableHead>
                <TableHead className={dataTableHead.mid}>ID</TableHead>
                <TableHead className={dataTableHead.mid}>大小</TableHead>
                <TableHead className={dataTableHead.mid}>创建时间</TableHead>
                <TableHead className={dataTableHead.last}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((img) => (
                <TableBodyRow key={img.id}>
                  <TableCell className="max-w-[220px] px-5 py-3">
                    <span className="block truncate font-mono text-xs text-foreground" title={img.repository}>
                      {img.repository}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {img.tag === '<none>' ? (
                      <span className="text-xs text-muted-foreground italic">无标签</span>
                    ) : (
                      <span className="inline-block rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-mono text-xs text-blue-500">
                        {img.tag}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {img.id.replace('sha256:', '').slice(0, 12)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-muted-foreground">{img.size}</TableCell>
                  <TableCell className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                    <span title={formatUnixSeconds(img.created_ts)}>{formatUnixSeconds(img.created_ts)}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghostAccent"
                        icon
                        title="Inspect"
                        onClick={() => setInspectTarget(img)}
                      >
                        <ScanSearch />
                      </Button>
                      <Button
                        type="button"
                        variant="ghostDanger"
                        icon
                        title="删除"
                        onClick={() => setRemoveTarget(img)}
                      >
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

      <ImagePullDialog
        serverId={serverId}
        open={showPull}
        onOpenChange={setShowPull}
        onSuccess={() => void fetchImages()}
      />

      {inspectTarget && (
        <InspectDialog
          serverId={serverId}
          kind="image"
          targetId={inspectTarget.id}
          targetLabel={imageRefLabel(inspectTarget)}
          onClose={() => setInspectTarget(null)}
        />
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="删除镜像"
        description={removeImageDescription}
        confirmText="删除"
        extra={
          <label className="flex cursor-pointer items-start gap-2.5 text-left">
            <Checkbox checked={removeForce} onCheckedChange={(c) => setRemoveForce(c === true)} className="mt-0.5" />
            <span className="text-xs leading-snug text-muted-foreground">强制删除</span>
          </label>
        }
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await commands.removeImage(serverId, removeTarget.id, removeForce)
            await fetchImages()
          } catch (e) {
            toast.error(String(e))
          }
        }}
      />
    </div>
  )
}
