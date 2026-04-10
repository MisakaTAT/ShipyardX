import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { commands } from '@/types/app-bindings'
import ImagePullDialog from '@/components/docker/dialogs/ImagePullDialog'
import { Trash2, Download, Image as ImageIcon, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { Image } from '@/types/app-bindings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PanelListLoading } from '@/components/ui/empty-state'
import { Checkbox } from '@/components/ui/checkbox'
import { PanelToolbar, PanelToolbarHeading, PanelToolbarSearch } from '@/components/ui/panel-toolbar'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import InspectDialog from '@/components/docker/dialogs/InspectDialog'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { cn } from '@/lib/utils'
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

  const imageColumns = useMemo<DataTableColumn<Image>[]>(
    () => [
      {
        key: 'repository',
        title: '仓库',
        render: (_, img) => (
          <span className="font-medium text-foreground" title={img.repository}>
            {img.repository}
          </span>
        ),
      },
      {
        key: 'id',
        title: 'ID',
        render: (_, img) => img.id.replace('sha256:', '').slice(0, 12),
      },
      {
        key: 'tag',
        title: '标签',
        render: (_, img) =>
          img.tag === '<none>' ? (
            <Badge variant="outline" size="tag" className="font-normal text-muted-foreground">
              无标签
            </Badge>
          ) : (
            <Badge variant="tag" size="tag">
              {img.tag}
            </Badge>
          ),
      },

      {
        key: 'size',
        title: '大小',
        render: (_, img) => img.size,
      },
      {
        key: 'created',
        title: '创建时间',
        render: (_, img) => <span title={formatUnixSeconds(img.created_ts)}>{formatUnixSeconds(img.created_ts)}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        render: (_, img) => (
          <div>
            <Button
              type="button"
              variant="ghost"
              icon
              title="Inspect"
              onClick={() => setInspectTarget(img)}
              className="rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ScanSearch />
            </Button>
            <Button
              type="button"
              variant="ghost"
              icon
              title="删除"
              onClick={() => setRemoveTarget(img)}
              className={cn('rounded-lg text-muted-foreground', 'hover:bg-red-500/10 hover:text-red-500')}
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
          <PanelListLoading />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ImageIcon />} title={search ? `无匹配的镜像 "${search}"` : '没有镜像'} />
        ) : (
          <DataTable className="w-full" rowKey="id" columns={imageColumns} rows={filtered} />
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
