import { useMemo, useState } from 'react'
import { Trash2, Download, Image as ImageIcon, Layers, ScanSearch } from 'lucide-react'
import type { Image } from '@/types/app-bindings'
import ImagePullDialog from '@/features/docker-images/ui/image-pull-dialog'
import ImageLayersDialog from '@/features/docker-images/ui/image-layers-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { formatUnixSeconds } from '@/shared/lib/datetime'
import { ConfirmDialog, DataTable, PanelHeader, PanelShell, ToneBadge, type ColumnDef } from '@/shared/components'
import { useImages, useRemoveImage } from '@/features/docker-images/api/use-images'

interface ImagePanelProps {
  serverId: string
}

const imageRefLabel = (img: Image) => (img.tag !== '<none>' ? `${img.repository}:${img.tag}` : img.id)

export default function ImagePanel({ serverId }: ImagePanelProps) {
  const { data: images = [], isFetching, dataUpdatedAt } = useImages(serverId)
  const removeImage = useRemoveImage(serverId)

  const [search, setSearch] = useState('')
  const [showPull, setShowPull] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Image | null>(null)
  const [inspectTarget, setInspectTarget] = useState<Image | null>(null)
  const [layersTarget, setLayersTarget] = useState<Image | null>(null)
  const [removeForce, setRemoveForce] = useState(false)

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
          return `${n} Container${n === 1 ? '' : 's'}`
        },
      },
      { id: 'size', header: '大小', cell: ({ row }) => row.original.size },
      {
        id: 'created',
        header: '创建时间',
        cell: ({ row }) => (
          <span title={formatUnixSeconds(row.original.created_ts)}>{formatUnixSeconds(row.original.created_ts)}</span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        meta: { width: '5rem' },
        cell: ({ row }) => {
          const img = row.original
          return (
            <div>
              <Button type="button" variant="ghost" size="icon-sm" title="Layers" onClick={() => setLayersTarget(img)}>
                <Layers />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Inspect"
                onClick={() => setInspectTarget(img)}
              >
                <ScanSearch />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="删除"
                onClick={() => {
                  setRemoveForce(false)
                  setRemoveTarget(img)
                }}
                className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 />
              </Button>
            </div>
          )
        },
      },
    ],
    []
  )

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
          <Button type="button" onClick={() => setShowPull(true)}>
            <Download />
            拉取镜像
          </Button>
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
          <label className="flex cursor-pointer items-start gap-2.5 text-left">
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
    </PanelShell>
  )
}
