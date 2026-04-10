import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent py-0 text-xs leading-none font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85',
        outline: 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
        secondary: 'bg-muted text-foreground hover:brightness-[0.97] dark:hover:brightness-110',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        ghostSoft: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        ghostAccent: 'rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        ghostDanger: 'rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500',
        destructive: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
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
