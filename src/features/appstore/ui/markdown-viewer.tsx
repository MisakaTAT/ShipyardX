import { useMemo, useCallback } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { marked } from 'marked'
import { sanitizeHtml } from '@/shared/lib/sanitize-html'

export function MarkdownViewer({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      const rendered = marked.parse(content, { async: false }) as string
      return sanitizeHtml(rendered)
    } catch {
      return `<p>Markdown 渲染失败</p>`
    }
  }, [content])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (anchor?.href) {
      e.preventDefault()
      openUrl(anchor.href)
    }
  }, [])

  return (
    <div
      className="text-[13px] leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-foreground [&_hr]:my-4 [&_hr]:border-border [&_li]:mt-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-[#1e1e1e] [&_pre]:p-3 [&_pre]:text-[12px] [&_strong]:font-semibold [&_strong]:text-foreground [&_table]:w-full [&_table]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:text-[12px] [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-[12px] [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}
