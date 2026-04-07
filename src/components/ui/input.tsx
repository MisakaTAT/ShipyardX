import * as React from 'react'

import { cn } from '@/lib/utils'

const inputClassName =
  'flex h-8 min-h-8 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-xs placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500/50 aria-invalid:focus-visible:border-red-500/70 group-data-[invalid=true]/field:border-red-500/50 group-data-[invalid=true]/field:focus-visible:border-red-500/70'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputClassName, className)} {...props} />
}

export { Input, inputClassName }
