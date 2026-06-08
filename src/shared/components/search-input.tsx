import { forwardRef, useRef, useImperativeHandle } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { useSearchHotkey } from '@/shared/hooks/use-search-hotkey'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  hotkey?: string | false
  clearable?: boolean
  autoFocus?: boolean
  name?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, placeholder, className, hotkey = '/', clearable = true, autoFocus, name },
  forwardedRef
) {
  const innerRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement)

  useSearchHotkey(innerRef, { enabled: hotkey !== false, key: typeof hotkey === 'string' ? hotkey : '/' })

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
        placeholder={placeholder}
        className={cn('w-full pl-9', clearable && value ? 'pr-8' : '')}
      />
      {clearable && value ? (
        <Button
          variant="ghost"
          size="icon"
          className="absolute inset-y-0 right-0 cursor-pointer rounded-l-none text-muted-foreground hover:bg-transparent focus-visible:ring-ring/50"
          aria-label="清除搜索"
          onClick={() => onChange('')}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  )
})
