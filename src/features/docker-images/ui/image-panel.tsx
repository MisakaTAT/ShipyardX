import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        header: t('ui.images.colRepository'),
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
        header: t('ui.images.colTags'),
        cell: ({ row }) =>
          row.original.tag === '<none>' ? (
            <ToneBadge tone="muted">{t('ui.images.noTags')}</ToneBadge>
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
      { id: 'size', header: t('ui.images.colSize'), cell: ({ row }) => row.original.size },
      {
        id: 'created',
        header: t('ui.common.created'),
        cell: ({ row }) => <span title={row.original.created_at || undefined}>{row.original.created_ago}</span>,
      },
      {
        id: 'actions',
        header: t('ui.common.actions'),
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
      t,
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
          title: t('ui.images.pruneDanglingTitle'),
          description: t('ui.images.pruneDanglingDesc'),
          confirmText: t('ui.images.pruneDanglingTitle'),
        },
        unused: {
          title: t('ui.images.pruneUnusedTitle'),
          description: t('ui.images.pruneUnusedDesc'),
          confirmText: t('ui.images.pruneUnusedTitle'),
        },
        builder: {
          title: t('ui.images.pruneCacheTitle'),
          description: t('ui.images.pruneCacheDesc'),
          confirmText: t('ui.images.pruneCacheTitle'),
        },
      }[cleanupTarget]
    : null

  const removeDescription = removeTarget ? t('ui.images.deleteDesc', { name: imageRefLabel(removeTarget) }) : ''

  return (
    <PanelShell>
      <PanelHeader
        icon={ImageIcon}
        title={t('ui.images.title')}
        stats={images.length > 0 ? `(${images.length})` : undefined}
        search={{ value: search, onChange: setSearch }}
        lastUpdated={dataUpdatedAt}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" />}>
              {t('ui.common.actions')}
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              <DropdownMenuItem onClick={() => setShowPull(true)}>
                <Download className="size-3.5" />
                {t('ui.images.pull')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowImport(true)}>
                <FolderUp className="size-3.5" />
                {t('ui.images.importTitle')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupTarget('dangling')}>
                <Trash2 className="size-3.5" />
                {t('ui.images.pruneDanglingTitle')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupTarget('unused')}>
                <Trash2 className="size-3.5" />
                {t('ui.images.pruneUnusedTitle')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanupTarget('builder')}>
                <Wrench className="size-3.5" />
                {t('ui.images.pruneCacheTitle')}
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
          title: search ? t('ui.images.noMatch', { query: search }) : t('ui.images.empty'),
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
        title={t('ui.images.deleteTitle')}
        description={removeDescription}
        destructive
        confirmText={t('ui.common.delete')}
        extra={
          <label className="flex w-full cursor-pointer items-start gap-2.5 text-left">
            <Checkbox checked={removeForce} onCheckedChange={(c) => setRemoveForce(c === true)} className="mt-0.5" />
            <span className="text-xs leading-snug text-muted-foreground">{t('ui.images.forceDelete')}</span>
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
        title={cleanupDialog?.title ?? t('ui.images.cleanupFallback')}
        description={cleanupDialog?.description}
        destructive
        confirmText={cleanupDialog?.confirmText ?? t('ui.images.cleanupFallback')}
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
