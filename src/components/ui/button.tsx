import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--accent-text)/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-(--accent) text-white hover:brightness-110 active:brightness-95',
        outline:
          'border-(--border-sub) bg-(--bg-input) text-(--text-soft) hover:bg-(--bg-surface) hover:text-(--text-base)',
        secondary: 'bg-(--bg-surface) text-(--text-base) hover:brightness-[0.97] dark:hover:brightness-110',
        ghost: 'text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)',
        destructive: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
        link: 'text-(--accent-text) underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 gap-1.5 px-2.5 text-sm',
        xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-auto min-h-0 gap-1.5 px-3.5 py-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-3 text-sm',
        icon: 'size-8',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
