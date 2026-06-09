import { useMemo, useState } from 'react'
import { ChevronDown, Download, FolderUp, Image as ImageIcon, Trash2, Wrench } from 'lucide-react'
import type { Image } from '@/types/app-bindings'
import ImagePullDialog from '@/features/docker-images/ui/image-pull-dialog'
import ImageExportDialog from '@/features/docker-images/ui/image-export-dialog'
import ImageImportDialog from '@/features/docker-images/ui/image-import-dialog'
import ImageLayersDialog from '@/features/docker-images/ui/image-layers-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { formatTimeAgo, formatUnixSeconds } from '@/shared/lib/datetime'
import { ConfirmDialog, DataTable, PanelHeader, PanelShell, ToneBadge, type ColumnDef } from '@/shared/components'
import {
  useExportImage,
  useImages,
  usePruneBuilderCache,
  usePruneDanglingImages,
  usePruneUnusedImages,
  useRemoveImage,
} from '@/features/docker-images/api/use-images'
import { ImageActionsMenu } from '@/features/docker-images/ui/image-actions-menu'
import { navigateWorkspace, setNextContainerSearch } from '@/shared/lib/workspace-nav'

interface ImagePanelProps {
  serverId: string
}

const imageRefLabel = (img: Image) => (img.tag !== '<none>' ? `${img.repository}:${img.tag}` : img.id)

export default function ImagePanel({ serverId }: ImagePanelProps) {
  const { data: images = [], isFetching, dataUpdatedAt } = useImages(serverId)
  const removeImage = useRemoveImage(serverId)
  const exportImage = useExportImage(serverId)
  const pruneDanglingImages = usePruneDanglingImages(serverId)
  const pruneUnusedImages = usePruneUnusedImages(serverId)
  const pruneBuilderCache = usePruneBuilderCache(serverId)

  const [search, setSearch] = useState('')
  const [showPull, setShowPull] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [exportTarget, setExportTarget] = useState<Image | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Image | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Image | null>(null)
  const [layersTarget, setLayersTarget] = useState<Image | null>(null)
  const [removeForce, setRemoveForce] = useState(false)
  const [cleanupTarget, setCleanupTarget] = useState<'dangling' | 'unused' | 'builder' | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return images
    const q = search.toLowerCase()
    return images.filter(
      (img) =>
        img.repository.toLowerCase().includes(q) ||
        img.tag.toLowerCase().includes(q) ||
        img.id.toLowerCase().includes(q)
    )
  }, [images, search])

  const columns: ColumnDef<Image>[] = useMemo(
    () => [
      {
        id: 'repository',
        header: '仓库',
        cell: ({ row }) => (
          <span className="font-medium text-foreground" title={row.original.repository}>
            {row.original.repository}
          </span>
        ),
      },
      {
        id: 'id',
        header: 'ID',
        cell: ({ row }) => row.original.id.replace('sha256:', '').slice(0, 12),
      },
      {
        id: 'tag',
        header: '标签',
        cell: ({ row }) =>
          row.original.tag === '<none>' ? (
            <ToneBadge tone="muted">无标签</ToneBadge>
          ) : (
            <ToneBadge tone="info" maxWidth="8rem">
              {row.original.tag}
            </ToneBadge>
          ),
      },
      {
        id: 'used_by',
        header: 'Used by',
        cell: ({ row }) => {
          const n = row.original.used_by_count
          if (n <= 0) return 'Unused'
          const img = row.original
          const label = `${n} Container${n === 1 ? '' : 's'}`
          const query = img.tag !== '<none>' ? `${img.repository}:${img.tag}` : img.repository
          return (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setNextContainerSearch(serverId, query)
                navigateWorkspace({ tab: 'containers', serverId, containerSearch: query })
              }}
            >
              {label}
            </button>
          )
        },
      },
      { id: 'size', header: '大小', cell: ({ row }) => row.original.size },
      {
        id: 'created',
        header: '创建时间',
        cell: ({ row }) => (
          <span title={formatUnixSeconds(row.original.created_ts)}>{formatTimeAgo(row.original.created_ts)}</span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        meta: { width: '3rem' },
        cell: ({ row }) => {
          const img = row.original
          return (
            <ImageActionsMenu
              image={img}
              busy={
                removeImage.isPending ||
                exportImage.isPending ||
                pruneDanglingImages.isPending ||
                pruneUnusedImages.isPending ||
                pruneBuilderCache.isPending
              }
              onExport={() => setExportTarget(img)}
              onLayers={() => setLayersTarget(img)}
              onInspect={() => setInspectTarget(img)}
              onRemove={() => {
                setRemoveForce(false)
                setRemoveTarget(img)
              }}
            />
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      exportImage.isPending,
      pruneBuilderCache.isPending,
      pruneDanglingImages.isPending,
      pruneUnusedImages.isPending,
      removeImage.isPending,
    ]
  )

  const cleanupDialog = cleanupTarget
    ? {
        dangling: {
          title: '清理悬空镜像',
          description: '仅删除没有标签且不再被引用的悬空镜像，用于回收无效层占用的空间。',
          confirmText: '清理悬空镜像',
        },
        unused: {
          title: '清理未使用镜像',
          description: '删除当前没有被任何容器使用的镜像。若后续还需要这些镜像，需要重新拉取或重新导入。',
          confirmText: '清理未使用镜像',
        },
        builder: {
          title: '清理构建缓存',
          description: '删除 Docker build 过程中留下的缓存层，不影响已存在的镜像和容器，但后续构建可能变慢。',
          confirmText: '清理构建缓存',
        },
      }[cleanupTarget]
    : null

  const removeDescription = removeTarget
    ? `确认删除镜像「${imageRefLabel(removeTarget)}」？\n\n默认情况下，若仍有容器使用该镜像，删除会失败。可勾选强制删除以解除引用并删除（可能影响运行中的容器，请谨慎）。`
    : ''

  return (
    <PanelShell>
      <PanelHeader
        icon={ImageIcon}
        title="镜像"
        stats={images.length > 0 ? `(${images.length})` : undefined}
        search={{ value: search, onChange: setSearch }}
        lastUpdated={dataUpdatedAt}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" />}>
              操作
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onClick={() => setShowPull(true)}>
                <Download className="size-3.5" />
                拉取镜像
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowImport(true)}>
                <FolderUp className="size-3.5" />
                导入镜像
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupTarget('dangling')}>
                <Trash2 className="size-3.5" />
                清理悬空镜像
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupTarget('unused')}>
                <Trash2 className="size-3.5" />
                清理未使用镜像
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupTarget('builder')}>
                <Wrench className="size-3.5" />
                清理构建缓存
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <DataTable<Image>
        columns={columns}
        data={filtered}
        getRowId={(img) => img.id}
        loading={isFetching && images.length === 0}
        empty={{
          icon: ImageIcon,
          title: search ? `无匹配的镜像 "${search}"` : '没有镜像',
        }}
      />

      <ImagePullDialog serverId={serverId} open={showPull} onOpenChange={setShowPull} />
      <ImageImportDialog serverId={serverId} open={showImport} onOpenChange={setShowImport} />
      <ImageExportDialog
        serverId={serverId}
        image={exportTarget}
        open={exportTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExportTarget(null)
        }}
      />

      {inspectTarget ? (
        <ResourceInspectDialog
          serverId={serverId}
          kind="image"
          targetId={inspectTarget.id}
          targetLabel={imageRefLabel(inspectTarget)}
          onClose={() => setInspectTarget(null)}
        />
      ) : null}

      <ImageLayersDialog
        serverId={serverId}
        open={layersTarget !== null}
        image={layersTarget}
        onOpenChange={(open) => {
          if (!open) {
            setLayersTarget(null)
          }
        }}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="删除镜像"
        description={removeDescription}
        destructive
        confirmText="删除"
        extra={
          <label className="flex w-full cursor-pointer items-start gap-2.5 text-left">
            <Checkbox checked={removeForce} onCheckedChange={(c) => setRemoveForce(c === true)} className="mt-0.5" />
            <span className="text-xs leading-snug text-muted-foreground">强制删除</span>
          </label>
        }
        onConfirm={() => {
          if (!removeTarget) return
          const target = removeTarget
          const force = removeForce
          removeImage.mutate({ imageId: target.id, force })
        }}
      />

      <ConfirmDialog
        open={cleanupTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCleanupTarget(null)
        }}
        title={cleanupDialog?.title ?? '清理'}
        description={cleanupDialog?.description}
        destructive
        confirmText={cleanupDialog?.confirmText ?? '清理'}
        onConfirm={() => {
          if (cleanupTarget === 'dangling') {
            pruneDanglingImages.mutate()
            return
          }
          if (cleanupTarget === 'unused') {
            pruneUnusedImages.mutate()
            return
          }
          if (cleanupTarget === 'builder') {
            pruneBuilderCache.mutate()
          }
        }}
      />
    </PanelShell>
  )
}
