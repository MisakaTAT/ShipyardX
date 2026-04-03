import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent bg-clip-padding py-0 text-xs font-medium leading-none whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--accent-text)/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: 'bg-(--accent) text-white hover:brightness-110 active:brightness-95',
        outline:
          'border-(--border-sub) bg-(--bg-input) text-(--text-soft) hover:bg-(--bg-surface) hover:text-(--text-base)',
        secondary: 'bg-(--bg-surface) text-(--text-base) hover:brightness-[0.97] dark:hover:brightness-110',
        ghost: 'text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)',
        ghostSoft: 'text-(--text-soft) hover:bg-(--bg-surface) hover:text-(--text-base)',
        ghostAccent: 'rounded-md text-(--text-muted) hover:bg-accent hover:text-accent-foreground',
        ghostDanger: 'rounded-lg text-(--text-muted) hover:bg-red-500/10 hover:text-red-500',
        destructive: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
        link: 'text-(--accent-text) underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  icon = false,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    icon?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-icon={icon || undefined}
      className={cn(buttonVariants({ variant }), icon ? 'size-8 shrink-0 gap-0 p-0' : 'h-8 min-h-8 px-2.5', className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
