import { useMemo, useState } from 'react'
import { Trash2, Download, Image as ImageIcon, ScanSearch } from 'lucide-react'
import type { Image } from '@/types/app-bindings'
import ImagePullDialog from '@/features/docker-images/ui/image-pull-dialog'
import ResourceInspectDialog from '@/features/docker-shared/ui/resource-inspect-dialog'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { formatUnixSeconds } from '@/shared/lib/datetime'
import {
  ConfirmDialog,
  DataTable,
  PanelHeader,
  PanelShell,
  type ColumnDef,
} from '@/shared/components'
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
        key: 'repository',
        title: '仓库',
        render: (img) => (
          <span className="font-medium text-foreground" title={img.repository}>
            {img.repository}
          </span>
        ),
      },
      { key: 'id', title: 'ID', render: (img) => img.id.replace('sha256:', '').slice(0, 12) },
      {
        key: 'tag',
        title: '标签',
        render: (img) =>
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
      { key: 'size', title: '大小', render: (img) => img.size },
      {
        key: 'created',
        title: '创建时间',
        render: (img) => <span title={formatUnixSeconds(img.created_ts)}>{formatUnixSeconds(img.created_ts)}</span>,
      },
      {
        key: 'actions',
        title: '操作',
        render: (img) => (
          <div>
            <Button type="button" variant="ghost" size="icon-sm" title="Inspect" onClick={() => setInspectTarget(img)}>
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
        ),
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
        rowKey={(img) => img.id}
        loading={isFetching && images.length === 0}
        empty={{
          icon: ImageIcon,
          title: search ? `无匹配的镜像 "${search}"` : '没有镜像',
        }}
      />

      <ImagePullDialog
        serverId={serverId}
        open={showPull}
        onOpenChange={setShowPull}
        onSuccess={() => {
          /* 拉取完成由事件流 invalidate */
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
            <Checkbox
              checked={removeForce}
              onCheckedChange={(c) => setRemoveForce(c === true)}
              className="mt-0.5"
            />
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
