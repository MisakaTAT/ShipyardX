import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-16 w-full resize-y rounded-lg border border-(--border-sub) bg-(--bg-input) px-3 py-2 text-xs text-(--text-base) transition-colors outline-none placeholder:text-xs placeholder:text-(--text-muted) focus-visible:border-(--accent) focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500/50 aria-invalid:focus-visible:border-red-500/70 group-data-[invalid=true]/field:border-red-500/50 group-data-[invalid=true]/field:focus-visible:border-red-500/70',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
