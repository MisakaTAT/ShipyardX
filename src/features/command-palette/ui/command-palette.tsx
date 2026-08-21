import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { useTranslation } from 'react-i18next'
import { useAppSettings } from '@/app/settings-store'
import { formatHotkeyLabel } from '@/shared/lib/hotkeys'
import { ChevronRight, CornerDownLeft, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Kbd, KbdGroup } from '@/shared/ui/kbd'
import { cn } from '@/shared/lib/utils'
import {
  filterItems,
  groupItems,
  withQuery,
  GROUP_LABEL_KEYS,
  GROUP_PATHS,
} from '@/features/command-palette/model/palette-item'
import { usePaletteItems } from '@/features/command-palette/api/use-palette-items'

interface CommandPaletteProps {
  open: boolean
  initialQuery?: string
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, initialQuery = '', onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const [, navigate] = useLocation()
  const {
    settings: {
      hotkeys: { commandPalette },
    },
  } = useAppSettings()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const items = usePaletteItems(open)

  const groups = useMemo(() => groupItems(filterItems(items, query)), [items, query])

  // 截断发生在分组内，索引必须基于截断后的结果，否则键盘会选到没渲染出来的条目
  const matched = useMemo(() => groups.flatMap((group) => group.items), [groups])

  useEffect(() => {
    setQuery(open ? initialQuery : '')
  }, [open, initialQuery])

  // 查询变化后旧的选中位置没有意义了
  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, matched])

  const run = (index: number) => {
    const item = matched[index]
    if (!item) return
    onOpenChange(false)
    item.run()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (matched.length ? (index + 1) % matched.length : 0))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (matched.length ? (index - 1 + matched.length) % matched.length : 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      run(active)
    }
  }

  let cursor = -1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[18%] flex! w-140 max-w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t('ui.palette.title')}</DialogTitle>

        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ui.palette.placeholder')}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} className="max-h-[min(60vh,26rem)] min-h-0 flex-1 overflow-y-auto p-1.5">
          {matched.length === 0 ? (
            <div className="px-3 py-10 text-center text-[13px] text-muted-foreground">{t('ui.palette.noResults')}</div>
          ) : (
            groups.map(({ group, items: groupItems }) => {
              const path = GROUP_PATHS[group]
              return (
                <div key={group} className="mb-1 last:mb-0">
                  {path ? (
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-0.5 px-2.5 py-1.5 text-[11px] leading-none font-medium text-muted-foreground uppercase transition-colors hover:text-foreground"
                      onClick={() => {
                        onOpenChange(false)
                        navigate(withQuery(path, query))
                      }}
                    >
                      <span className="mr-[-0.08em] tracking-[0.08em]">{t(GROUP_LABEL_KEYS[group])}</span>
                      <ChevronRight className="size-3" />
                    </button>
                  ) : (
                    <div className="flex items-center px-2.5 py-1.5 text-[11px] leading-none font-medium tracking-[0.08em] text-muted-foreground uppercase">
                      {t(GROUP_LABEL_KEYS[group])}
                    </div>
                  )}
                  {groupItems.map((item) => {
                    cursor += 1
                    const index = cursor
                    const Icon = item.icon
                    const isActive = index === active
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-active={isActive}
                        onMouseMove={() => setActive(index)}
                        onClick={() => run(index)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          isActive ? 'bg-muted text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-foreground">{item.title}</span>
                          {item.subtitle ? (
                            <span className="block truncate text-[11px] text-muted-foreground">{item.subtitle}</span>
                          ) : null}
                        </span>
                        {isActive ? <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border bg-muted/30 px-3.5 text-[11px] text-muted-foreground">
          <Hint label={t('ui.palette.hintSelect')}>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </Hint>
          <Hint label={t('ui.palette.hintOpen')}>
            <Kbd>↵</Kbd>
          </Hint>
          <Hint label={t('ui.palette.hintClose')}>
            <Kbd>Esc</Kbd>
          </Hint>
          <Hint label={t('ui.palette.hintToggle')} className="ml-auto">
            <Kbd>{formatHotkeyLabel(commandPalette)}</Kbd>
          </Hint>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Hint({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1', className)}>
      {label}
      <KbdGroup>{children}</KbdGroup>
    </span>
  )
}
