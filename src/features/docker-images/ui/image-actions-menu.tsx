import { Layers, MoreHorizontal, ScanSearch, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import type { Image } from '@/types/app-bindings'

interface ImageActionsMenuProps {
  image: Image
  busy?: boolean
  onLayers: () => void
  onInspect: () => void
  onRemove: () => void
}

export function ImageActionsMenu({ image: _image, busy, onLayers, onInspect, onRemove }: ImageActionsMenuProps) {
  const disabled = Boolean(busy)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" title="更多操作" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onLayers} disabled={disabled}>
          <Layers className="size-3.5" />
          Layers
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onInspect} disabled={disabled}>
          <ScanSearch className="size-3.5" />
          Inspect
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onRemove} disabled={disabled}>
          <Trash2 className="size-3.5" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
