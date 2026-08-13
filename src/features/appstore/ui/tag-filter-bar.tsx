import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'

interface TagFilterBarProps {
  /** [标签, 出现次数]，已按次数排好序 */
  tags: [string, number][]
  selected: Set<string>
  onToggle: (tag: string) => void
}

export function TagFilterBar({ tags, selected, onToggle }: TagFilterBarProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [hiddenCount, setHiddenCount] = useState(0)

  // 折叠时把选中的挪到最前，否则选中第二行的标签一折叠就看不见了，筛选却还生效
  const ordered = useMemo(() => {
    if (expanded || selected.size === 0) return tags
    return [...tags].sort((a, b) => Number(selected.has(b[0])) - Number(selected.has(a[0])))
  }, [tags, selected, expanded])

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return

    const measure = () => {
      const items = Array.from(el.children) as HTMLElement[]
      const first = items[0]
      if (!first) {
        setRowHeight(null)
        setHiddenCount(0)
        return
      }
      setRowHeight(first.offsetHeight)
      setHiddenCount(items.filter((item) => item.offsetTop > first.offsetTop).length)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ordered])

  if (tags.length === 0) return null

  const overflowing = hiddenCount > 0 || expanded

  return (
    <div className="mt-3 flex items-start gap-1.5">
      <div
        ref={listRef}
        className="flex min-w-0 flex-1 flex-wrap gap-1.5 overflow-hidden"
        style={expanded || rowHeight === null ? undefined : { maxHeight: rowHeight }}
      >
        {ordered.map(([tag, count]) => (
          <Badge
            key={tag}
            variant={selected.has(tag) ? 'default' : 'outline'}
            className="cursor-pointer text-[11px] transition-colors"
            onClick={() => onToggle(tag)}
          >
            {tag}
            <span className="ml-1 text-[10px] opacity-60">{count}</span>
          </Badge>
        ))}
      </div>

      {/* 始终占位：按钮挤在 flex 里会改变换行结果，显隐切换会让测量来回抖 */}
      <Badge
        variant="secondary"
        aria-hidden={!overflowing}
        tabIndex={overflowing ? undefined : -1}
        title={t(expanded ? 'ui.appStore.collapseTags' : 'ui.appStore.showAllTags')}
        className={cn(
          'shrink-0 cursor-pointer text-[11px] transition-colors',
          overflowing ? null : 'pointer-events-none invisible'
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? t('ui.appStore.collapse') : t('ui.appStore.moreTags', { count: String(hiddenCount) })}
      </Badge>
    </div>
  )
}
