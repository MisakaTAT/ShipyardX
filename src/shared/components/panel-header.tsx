import type { ComponentType, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideProps } from 'lucide-react'
import { SearchInput } from '@/shared/components/search-input'
import { formatNowTime } from '@/shared/lib/datetime'
import { cn } from '@/shared/lib/utils'

export interface PanelHeaderSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

interface PanelHeaderProps {
  icon?: ComponentType<LucideProps>
  title: ReactNode
  stats?: ReactNode
  search?: PanelHeaderSearchProps
  lastUpdated?: string | number | null
  actions?: ReactNode
  className?: string
}

export function PanelHeader({ icon: Icon, title, stats, search, lastUpdated, actions, className }: PanelHeaderProps) {
  const { t } = useTranslation()
  const updatedText =
    lastUpdated == null
      ? null
      : typeof lastUpdated === 'number'
        ? lastUpdated > 0
          ? formatNowTime(new Date(lastUpdated))
          : null
        : lastUpdated

  return (
    <div className={cn('flex h-11 shrink-0 items-center gap-3 border-b border-border bg-card px-3', className)}>
      <div className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="truncate">{title}</span>
        {stats ? <span className="text-xs font-normal text-muted-foreground">{stats}</span> : null}
      </div>

      {search ? (
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder}
          className={search.className ?? 'w-56'}
        />
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {updatedText ? (
          <span className="text-[11px] text-muted-foreground">{t('ui.panel.updatedAt', { time: updatedText })}</span>
        ) : null}
        {actions}
      </div>
    </div>
  )
}
