import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { openCommandPalette } from '@/features/command-palette/model/palette-control'

interface ActiveFilterChipProps {
  query: string
  count: number
  onClear: () => void
}

export function ActiveFilterChip({ query, count, onClear }: ActiveFilterChipProps) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 flex">
      <div className="flex h-7 items-center rounded-lg bg-muted text-xs text-muted-foreground">
        <button
          type="button"
          title={t('ui.filter.edit')}
          onClick={() => openCommandPalette(query)}
          className="flex h-full min-w-0 cursor-pointer items-center gap-1.5 rounded-l-lg pr-2 pl-2.5 transition-colors hover:text-foreground"
        >
          <Search className="size-3 shrink-0" aria-hidden />
          <span className="max-w-56 truncate text-foreground">{query}</span>
          <span className="shrink-0 tabular-nums">· {count}</span>
        </button>
        <button
          type="button"
          title={t('ui.filter.clear')}
          onClick={onClear}
          className="flex h-full cursor-pointer items-center rounded-r-lg pr-2 pl-1 transition-colors hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  )
}
