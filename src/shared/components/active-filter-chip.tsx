import { Search, X } from 'lucide-react'

/** 搜索框移进命令面板后，页面得有个东西说明「为什么只剩这几条」 */
export function ActiveFilterChip({ query, count, onClear }: { query: string; count: number; onClear: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 py-1 pr-1 pl-2.5">
        <Search className="size-3 shrink-0" aria-hidden />
        <span className="max-w-56 truncate">{query}</span>
        <button
          type="button"
          title="清除筛选"
          onClick={onClear}
          className="flex cursor-pointer items-center rounded p-0.5 transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </span>
      <span className="tabular-nums">{count} 条匹配</span>
    </div>
  )
}
