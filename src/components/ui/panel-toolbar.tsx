import * as React from 'react'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function PanelToolbar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-toolbar"
      className={cn('flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3', className)}
      style={{ background: 'var(--bg-panel)' }}
      {...props}
    />
  )
}

const headingIconClass = 'h-4 w-4 shrink-0 text-(--text-soft)'

function PanelToolbarHeading({ icon, title, meta }: { icon: React.ReactNode; title: string; meta?: React.ReactNode }) {
  const iconNode = React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
        className: cn(headingIconClass, (icon as React.ReactElement<{ className?: string }>).props.className),
      })
    : icon

  return (
    <>
      {iconNode}
      <span className="mr-1 text-sm font-medium text-(--text-base)">{title}</span>
      {meta != null && meta !== false ? <span className="text-xs text-(--text-muted)">{meta}</span> : null}
    </>
  )
}

type PanelToolbarSearchVariant = 'toolbar' | 'page'

type PanelToolbarSearchProps = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange' | 'className'> & {
  value: string
  onValueChange: (value: string) => void
  variant?: PanelToolbarSearchVariant
}

const PanelToolbarSearch = React.forwardRef<HTMLInputElement, PanelToolbarSearchProps>(function PanelToolbarSearch(
  { value, onValueChange, placeholder, variant = 'toolbar', ...inputProps },
  ref,
) {
  const isPage = variant === 'page'

  return (
    <div className={cn('relative', isPage ? 'mt-4 w-full' : 'ml-2')}>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 text-(--text-muted)',
          isPage ? 'left-3' : 'left-2.5',
        )}
        aria-hidden
      />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn('pr-8', isPage ? 'w-full pl-9' : 'w-52 pl-8')}
        {...inputProps}
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          icon
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2 rounded-full text-(--text-muted)"
          aria-label="清除搜索"
          onClick={() => onValueChange('')}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  )
})

export { PanelToolbar, PanelToolbarHeading, PanelToolbarSearch }
