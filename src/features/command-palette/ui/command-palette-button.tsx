import { Search } from 'lucide-react'
import { useAppSettings } from '@/app/settings-store'
import { formatHotkeyLabel } from '@/shared/lib/hotkeys'
import { Button } from '@/shared/ui/button'
import { openCommandPalette } from '@/features/command-palette/model/palette-control'

export function CommandPaletteButton() {
  const {
    settings: {
      hotkeys: { commandPalette },
    },
  } = useAppSettings()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="text-muted-foreground"
      aria-label="搜索"
      title={`搜索服务器、转发规则、指纹，或执行命令（${formatHotkeyLabel(commandPalette)}）`}
      onClick={() => openCommandPalette()}
    >
      <Search />
    </Button>
  )
}
