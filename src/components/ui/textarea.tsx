import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-16 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground transition-colors outline-none group-data-[invalid=true]/field:border-red-500/50 placeholder:text-xs placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-0 group-data-[invalid=true]/field:focus-visible:border-red-500/70 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500/50 aria-invalid:focus-visible:border-red-500/70',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
