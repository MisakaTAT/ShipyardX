import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { SearchInput } from '@/shared/components/search-input'
import { formatNowTime } from '@/shared/lib/datetime'

export interface PanelHeaderSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hotkey?: string | false
  className?: string
}

interface PanelHeaderProps {
  icon?: ComponentType<LucideProps>
  title: ReactNode
  stats?: ReactNode
  search?: PanelHeaderSearchProps
  /** TanStack Query 返回的 dataUpdatedAt 或 "刚刚" 字符串；传 number 自动格式化 */
  lastUpdated?: string | number | null
  actions?: ReactNode
  className?: string
}

/**
 * 列表面板的统一顶部栏。替代各 Panel 里重复的 "icon + title + stats + search + actions" 结构。
 */
export function PanelHeader({
  icon: Icon,
  title,
  stats,
  search,
  lastUpdated,
  actions,
  className,
}: PanelHeaderProps) {
  const updatedText =
    lastUpdated == null
      ? null
      : typeof lastUpdated === 'number'
        ? lastUpdated > 0
          ? formatNowTime(new Date(lastUpdated))
          : null
        : lastUpdated

  return (
    <div
      className={
        'flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-5 py-4' +
        (className ? ' ' + className : '')
      }
    >
      <div className="inline-flex items-center gap-2.5">
        {Icon ? (
          <div className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground [&_svg]:size-4">
            <Icon />
          </div>
        ) : null}
        <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span>{title}</span>
          {stats ? <span className="font-normal text-muted-foreground">{stats}</span> : null}
        </div>
      </div>

      {search ? (
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder ?? '搜索… ("/" 快速聚焦)'}
          hotkey={search.hotkey}
          className={search.className ?? 'ml-4 w-full max-w-xs'}
        />
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {updatedText ? <span className="mr-1 text-xs text-muted-foreground">更新于 {updatedText}</span> : null}
        {actions}
      </div>
    </div>
  )
}
