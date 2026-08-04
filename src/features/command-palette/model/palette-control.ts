const EVENT_NAME = 'command-palette:open'

/** initialQuery 用于「接着上次的词继续搜」，比如从页面的筛选标记点回来 */
export function openCommandPalette(initialQuery?: string) {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: initialQuery ?? '' }))
  } catch {
    /* ignore */
  }
}

export function onOpenCommandPalette(cb: (initialQuery: string) => void) {
  const handler = (event: Event) => cb((event as CustomEvent<string>).detail ?? '')
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}
