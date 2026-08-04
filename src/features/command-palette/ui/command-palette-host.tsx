import { useEffect, useState } from 'react'
import { useAppSettings } from '@/app/settings-store'
import { matchHotkey } from '@/shared/lib/hotkeys'
import { CommandPalette } from '@/features/command-palette/ui/command-palette'

export function CommandPaletteHost() {
  const {
    settings: {
      hotkeys: { commandPalette },
    },
  } = useAppSettings()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!matchHotkey(event, commandPalette)) return
      if (!open && document.querySelector('[role="alertdialog"], [data-state="open"][role="dialog"]')) return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPalette, open])

  return <CommandPalette open={open} onOpenChange={setOpen} />
}
