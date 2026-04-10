import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { commands } from '@/types/app-bindings'
import ImagePullDialog from '@/components/docker/dialogs/ImagePullDialog'
import { Trash2, Download, Image as ImageIcon, ScanSearch, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Image } from '@/types/app-bindings'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import InspectDialog from '@/components/docker/dialogs/InspectDialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatNowTime, formatUnixSeconds } from '@/utils/datetime'

interface ImagePanelProps {
  serverId: string
  refreshTick?: number
}
type DataTableColumn<T extends object> = {
  key: string
  title: React.ReactNode
  render?: (value: unknown, record: T, index: number) => React.ReactNode
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
            <Badge variant="outline" className="h-auto rounded px-2 py-0.5 font-normal text-muted-foreground">
              无标签
            </Badge>
          ) : (
            <Badge variant="outline" className="h-auto rounded px-2 py-0.5">
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
              size="icon-sm"
              title="Inspect"
              onClick={() => setInspectTarget(img)}
              className="rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ScanSearch />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
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
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-4">
        <div className="inline-flex items-center gap-2.5">
          <div className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground [&_svg]:size-4">
            <ImageIcon />
          </div>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span>镜像</span>
            {images.length > 0 ? <span className="font-normal text-muted-foreground">({images.length})</span> : null}
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
          <Button type="button" onClick={() => setShowPull(true)}>
            <Download />
            拉取镜像
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-card">
        {loading && images.length === 0 ? (
          <div className="flex h-full min-h-48 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <div className="flex justify-center text-border [&_svg]:size-7">
              <ImageIcon />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{search ? `无匹配的镜像 "${search}"` : '没有镜像'}</p>
          </div>
        ) : (
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                {imageColumns.map((col) => (
                  <TableHead key={col.key}>{col.title}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, idx) => (
                <TableRow key={row.id}>
                  {imageColumns.map((col) => (
                    <TableCell key={col.key}>{col.render ? col.render(undefined, row, idx) : null}</TableCell>
                  ))}
                </TableRow>
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

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除镜像</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">{removeImageDescription}</AlertDialogDescription>
            <div className="pt-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-left">
                <Checkbox
                  checked={removeForce}
                  onCheckedChange={(c) => setRemoveForce(c === true)}
                  className="mt-0.5"
                />
                <span className="text-xs leading-snug text-muted-foreground">强制删除</span>
              </label>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!removeTarget) return
                void (async () => {
                  try {
                    await commands.removeImage(serverId, removeTarget.id, removeForce)
                    await fetchImages()
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
