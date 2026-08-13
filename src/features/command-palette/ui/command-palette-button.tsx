import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { useAppSettings } from '@/app/settings-store'
import { formatHotkeyLabel } from '@/shared/lib/hotkeys'
import { Button } from '@/shared/ui/button'
import { openCommandPalette } from '@/features/command-palette/model/palette-control'

export function CommandPaletteButton() {
  const { t } = useTranslation()
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
      aria-label={t('ui.common.search')}
      title={t('ui.palette.buttonTitle', { hotkey: formatHotkeyLabel(commandPalette) })}
      onClick={() => openCommandPalette()}
    >
      <Search />
    </Button>
  )
}
