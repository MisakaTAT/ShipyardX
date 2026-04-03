import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'
import { CheckIcon } from 'lucide-react'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'relative flex size-3.5 shrink-0 items-center justify-center rounded border border-(--border-sub) bg-(--bg-input) text-transparent transition-colors outline-none focus-visible:border-(--accent) focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500/50 data-[state=checked]:border-(--accent) data-[state=checked]:bg-(--accent) data-[state=checked]:text-white data-[state=indeterminate]:border-(--accent) data-[state=indeterminate]:bg-(--accent) data-[state=indeterminate]:text-white',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
