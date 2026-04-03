import * as React from 'react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn('grid w-full gap-2', className)} {...props} />
}

function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'relative flex size-3.5 shrink-0 items-center justify-center rounded-full border border-(--border-sub) bg-(--bg-input) text-transparent transition-colors outline-none focus-visible:border-(--accent) focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500/50 data-[state=checked]:border-(--accent) data-[state=checked]:bg-(--accent) data-[state=checked]:text-white',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-full items-center justify-center text-current"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
