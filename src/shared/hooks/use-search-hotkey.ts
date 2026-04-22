import { useEffect, type RefObject } from 'react'

/** 绑定 "/" 到搜索 input；在输入框聚焦或对话框打开时不抢焦点 */
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
      if (document.querySelector('[role="alertdialog"], [data-state="open"][role="dialog"]')) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ref, enabled, key])
}
