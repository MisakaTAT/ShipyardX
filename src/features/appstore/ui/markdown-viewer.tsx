import { useEffect, useRef, useCallback } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import ZeroMd from 'zero-md'

customElements.define('zero-md', ZeroMd)

interface ZeroMdElement extends HTMLElement {
  version: string
}

export function MarkdownViewer({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const div = containerRef.current
    div.innerHTML = ''
    const el = document.createElement('zero-md') as ZeroMdElement
    const script = document.createElement('script')
    script.type = 'text/markdown'
    script.textContent = content
    el.appendChild(script)
    div.appendChild(el)
  }, [content])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const path = e.nativeEvent.composedPath()
    for (const el of path) {
      if (el instanceof HTMLAnchorElement && el.href) {
        e.preventDefault()
        openUrl(el.href)
        return
      }
    }
  }, [])

  return <div ref={containerRef} onClick={handleClick} />
}
