import { useEffect, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import 'highlight.js/styles/atom-one-dark.css'
import { sanitizeHtml } from '@/shared/lib/sanitize-html'

hljs.registerLanguage('bash', bash)

/** 流式追加时每段都全量高亮会退化成 O(n²) */
const HIGHLIGHT_INTERVAL_MS = 250
/** 只高亮末尾这部分 */
const MAX_HIGHLIGHT_CHARS = 64 * 1024

function highlight(text: string) {
  const clipped = text.length > MAX_HIGHLIGHT_CHARS ? text.slice(text.length - MAX_HIGHLIGHT_CHARS) : text
  return sanitizeHtml(hljs.highlight(clipped, { language: 'bash' }).value)
}

export function HighlightLog({ outputs }: { outputs: string[] }) {
  const [html, setHtml] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<string[]>(outputs)

  latestRef.current = outputs

  useEffect(() => {
    if (timerRef.current !== null) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setHtml(highlight(latestRef.current.join('')))
    }, HIGHLIGHT_INTERVAL_MS)
  }, [outputs])

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    []
  )

  return (
    <pre className="mt-2 max-h-48 overflow-auto rounded-md font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">
      <code className="hljs language-bash" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
