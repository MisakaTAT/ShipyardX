import { useState, useEffect, useCallback, useRef } from 'react'
import { cancelStream, listImages, removeImage, startImagePull } from '@/lib/commands'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Trash2, Download, Loader2, Image as ImageIcon, Search, X, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { DockerImage } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from './ConfirmDialog'
import InspectModal from './InspectModal'
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
import { cn } from '@/lib/utils'
import { formatNowTime, formatUnixSeconds } from '@/utils/datetime'

interface ImagePanelProps {
  serverId: string
  refreshTick?: number
}

export default function ImagePanel({ serverId, refreshTick }: ImagePanelProps) {
  const [images, setImages] = useState<DockerImage[]>([])
  const [loading, setLoading] = useState(false)
  const [showPull, setShowPull] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [removeTarget, setRemoveTarget] = useState<DockerImage | null>(null)
  const [inspectTarget, setInspectTarget] = useState<DockerImage | null>(null)
  const [removeForce, setRemoveForce] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchImages = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listImages({ serverId })
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

  const imageRefLabel = (img: DockerImage) => (img.tag !== '<none>' ? `${img.repository}:${img.tag}` : img.id)

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
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-app)' }}>
      {/* Toolbar */}
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3"
        style={{ background: 'var(--bg-panel)' }}
      >
        <ImageIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-soft)' }} />
        <span className="text-sm font-medium mr-1" style={{ color: 'var(--text-base)' }}>
          镜像
        </span>
        {images.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ({images.length})
          </span>
        )}

        {/* 搜索 */}
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
            className="h-8 w-48 border-(--border-sub) bg-(--bg-input) pr-8 pl-8 text-xs text-(--text-base)"
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
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setShowPull(true)}>
            <Download className="size-3.5 stroke-[2.5]" />
            拉取镜像
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-(--bg-panel)">
        {loading && images.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
            <ImageIcon className="w-10 h-10 mb-3" style={{ color: 'var(--border-sub)' }} />
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
                  <TableCell className="px-5 py-3 max-w-[220px]">
                    <span
                      className="font-mono text-xs truncate block"
                      style={{ color: 'var(--text-base)' }}
                      title={img.repository}
                    >
                      {img.repository}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {img.tag === '<none>' ? (
                      <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                        无标签
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-blue-500/10 text-blue-500 border border-blue-500/30">
                        {img.tag}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {img.id.replace('sha256:', '').slice(0, 12)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                    {img.size}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                    <span title={formatUnixSeconds(img.created_ts)}>{formatUnixSeconds(img.created_ts)}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Inspect"
                        onClick={() => setInspectTarget(img)}
                        className="rounded-md text-(--text-muted) hover:bg-accent hover:text-accent-foreground"
                      >
                        <ScanSearch className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="删除"
                        onClick={() => setRemoveTarget(img)}
                        className={cn('rounded-lg text-(--text-muted)', 'hover:bg-red-500/10 hover:text-red-500')}
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

      {/* Pull Modal */}
      {showPull && <PullModal serverId={serverId} onSuccess={fetchImages} onClose={() => setShowPull(false)} />}

      {inspectTarget && (
        <InspectModal
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
            <input
              type="checkbox"
              checked={removeForce}
              onChange={(e) => setRemoveForce(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 rounded border-(--border-sub) bg-(--bg-input) accent-(--accent)"
            />
            <span className="text-xs leading-snug text-(--text-muted)">强制删除</span>
          </label>
        }
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await removeImage({
              serverId,
              imageId: removeTarget.id,
              force: removeForce,
            })
            await fetchImages()
          } catch (e) {
            toast.error(String(e))
          }
        }}
      />
    </div>
  )
}

// ===== 流式拉取 Modal =====

interface PullModalProps {
  serverId: string
  onSuccess: () => void
  onClose: () => void
}

function PullModal({ serverId, onSuccess, onClose }: PullModalProps) {
  const [image, setImage] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'pulling' | 'success' | 'error'>('idle')
  const [pullId, setPullId] = useState<string | null>(null)
  const unlistenDataRef = useRef<UnlistenFn | null>(null)
  const unlistenDoneRef = useRef<UnlistenFn | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  const cleanup = useCallback(
    async (id?: string | null) => {
      if (unlistenDataRef.current) {
        unlistenDataRef.current()
        unlistenDataRef.current = null
      }
      if (unlistenDoneRef.current) {
        unlistenDoneRef.current()
        unlistenDoneRef.current = null
      }
      const target = id ?? pullId
      if (target) {
        try {
          await cancelStream({ streamId: target })
        } catch {
          /* ignore */
        }
        setPullId(null)
      }
    },
    [pullId],
  )

  const handlePull = async () => {
    const img = image.trim()
    if (!img) return
    await cleanup()
    setStatus('pulling')
    setLines([`> docker pull ${img}`, ''])

    try {
      const id = await startImagePull({
        serverId,
        image: img,
      })
      setPullId(id)

      unlistenDataRef.current = await listen<string>(`pull-data:${id}`, (event) => {
        const chunk = event.payload
        setLines((prev) => {
          const newLines = chunk.split('\n')
          if (prev.length > 0 && !prev[prev.length - 1].endsWith('\n')) {
            const updated = [...prev]
            updated[updated.length - 1] += newLines[0]
            return [...updated, ...newLines.slice(1)]
          }
          return [...prev, ...newLines]
        })
      })

      unlistenDoneRef.current = await listen<boolean>(`pull-done:${id}`, (event) => {
        const success = event.payload
        setStatus(success ? 'success' : 'error')
        if (success) {
          setLines((prev) => [...prev, '', '✓ 拉取成功'])
          onSuccess()
        } else {
          setLines((prev) => [...prev, '', '✗ 拉取失败'])
        }
        setPullId(null)
      })
    } catch (e) {
      setStatus('error')
      setLines((prev) => [...prev, `错误: ${String(e)}`])
    }
  }

  const handleClose = async () => {
    await cleanup()
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) void handleClose()
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
          <Download className="size-4 text-(--accent-text)" />
          <DialogTitle className="flex-1 text-sm font-semibold text-(--text-strong)">拉取镜像</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
            onClick={() => void handleClose()}
          >
            <X className="size-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={image}
              onChange={(e) => setImage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && status !== 'pulling' && void handlePull()}
              placeholder="nginx:latest 或 ubuntu:22.04"
              disabled={status === 'pulling'}
              className="flex-1 border-(--border-sub) bg-(--bg-input) font-mono text-sm text-(--text-base) disabled:opacity-50"
            />
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={!image.trim() || status === 'pulling'}
              onClick={() => void handlePull()}
            >
              {status === 'pulling' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin stroke-[2.5]" />
                  拉取中
                </>
              ) : (
                <>
                  <Download className="size-3.5 stroke-[2.5]" />
                  拉取
                </>
              )}
            </Button>
          </div>

          {lines.length > 0 ? (
            <div ref={outputRef} className="h-52 overflow-y-auto rounded-lg border border-border bg-(--bg-app) p-3">
              <pre className="font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-(--text-base)">
                {lines.join('\n')}
              </pre>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
