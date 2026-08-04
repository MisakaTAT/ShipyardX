import { useEffect, useState } from 'react'
import { useAppSettings } from '@/app/settings-store'
import { matchHotkey } from '@/shared/lib/hotkeys'
import { onOpenCommandPalette } from '@/features/command-palette/model/palette-control'
import { CommandPalette } from '@/features/command-palette/ui/command-palette'

export function CommandPaletteHost() {
  const {
    settings: {
      hotkeys: { commandPalette },
    },
  } = useAppSettings()
  const [open, setOpen] = useState(false)
  const [initialQuery, setInitialQuery] = useState('')

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!matchHotkey(event, commandPalette)) return
      if (!open && document.querySelector('[role="alertdialog"], [data-state="open"][role="dialog"]')) return
      event.preventDefault()
      setInitialQuery('')
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPalette, open])

  useEffect(
    () =>
      onOpenCommandPalette((query) => {
        setInitialQuery(query)
        setOpen(true)
      }),
    []
  )

  return <CommandPalette open={open} initialQuery={initialQuery} onOpenChange={setOpen} />
}
