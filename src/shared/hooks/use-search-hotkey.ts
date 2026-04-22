import { useEffect, type RefObject } from 'react'

/**
 * 把 "/" 绑定到一个搜索 input。若焦点已在 INPUT/TEXTAREA，或有 alert-dialog 打开，则跳过。
 * 取代各 Panel 里重复的 window.addEventListener 代码。
 */
export function useSearchHotkey(
  ref: RefObject<HTMLInputElement | null>,
  options: { enabled?: boolean; key?: string } = {}
) {
  const { enabled = true, key = '/' } = options
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== key) return
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement | null)?.isContentEditable) return
      // 有对话框打开（AlertDialog/Dialog）时不抢焦点
      if (document.querySelector('[role="alertdialog"], [data-state="open"][role="dialog"]')) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ref, enabled, key])
}
