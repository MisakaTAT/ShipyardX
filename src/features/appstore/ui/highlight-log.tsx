import { useMemo } from 'react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import 'highlight.js/styles/atom-one-dark.css'
import { sanitizeHtml } from '@/shared/lib/sanitize-html'

hljs.registerLanguage('bash', bash)

export function HighlightLog({ outputs }: { outputs: string[] }) {
  const html = useMemo(() => {
    const text = outputs.join('')
    return sanitizeHtml(hljs.highlight(text, { language: 'bash' }).value)
  }, [outputs])

  return (
    <pre className="mt-2 max-h-48 overflow-auto rounded-md font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">
      <code className="hljs language-bash" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
