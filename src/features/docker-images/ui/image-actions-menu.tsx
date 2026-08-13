import { useTranslation } from 'react-i18next'
import { Download, Layers, MoreHorizontal, ScanSearch, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import type { Image } from '@/types/app-bindings'

interface ImageActionsMenuProps {
  image: Image
  busy?: boolean
  onExport: () => void
  onLayers: () => void
  onInspect: () => void
  onRemove: () => void
}

export function ImageActionsMenu({
  image: _image,
  busy,
  onExport,
  onLayers,
  onInspect,
  onRemove,
}: ImageActionsMenuProps) {
  const { t } = useTranslation()
  const disabled = Boolean(busy)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" title={t('ui.common.moreActions')} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        <DropdownMenuItem onClick={onExport} disabled={disabled}>
          <Download className="size-3.5" />
          {t('ui.common.export')}
        </DropdownMenuItem>
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
          {t('ui.common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
