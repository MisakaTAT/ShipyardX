import { useEffect, type RefObject } from 'react'
import { matchHotkey } from '@/shared/lib/hotkeys'

export function useSearchHotkey(
  ref: RefObject<HTMLInputElement | null>,
  options: { enabled?: boolean; hotkey?: string | null } = {}
) {
  const { enabled = true, hotkey = '/' } = options
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (!matchHotkey(e, hotkey)) return
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement | null)?.isContentEditable) return
      if (document.querySelector('[role="alertdialog"], [data-state="open"][role="dialog"]')) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ref, enabled, hotkey])
}
