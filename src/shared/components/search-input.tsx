import { forwardRef, useRef, useImperativeHandle, type KeyboardEventHandler } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  clearButtonClassName?: string
  clearable?: boolean
  autoFocus?: boolean
  name?: string
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onChange,
    placeholder,
    className,
    inputClassName,
    clearButtonClassName,
    clearable = true,
    autoFocus,
    name,
    onKeyDown,
  },
  forwardedRef
) {
  const { t } = useTranslation()
  const innerRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement)

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={innerRef}
        name={name}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? t('ui.common.search')}
        className={cn('w-full pl-9', clearable && value ? 'pr-8' : '', inputClassName)}
      />
      {clearable && value ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute inset-y-0 right-0 cursor-pointer rounded-l-none text-muted-foreground hover:bg-transparent focus-visible:ring-ring/50',
            clearButtonClassName
          )}
          aria-label={t('ui.common.clearSearch')}
          onClick={() => onChange('')}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  )
})
