import { cva, type VariantProps } from 'class-variance-authority'

export const fullScreenDialogContent =
  'flex! fixed! inset-0! top-0! left-0! h-dvh max-h-dvh w-full max-w-full translate-x-0! translate-y-0! flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none sm:max-w-full'

export const modalDialogContent = 'flex! min-w-md flex-col gap-0 overflow-hidden p-0'

export const toneBadge = cva('', {
  variants: {
    tone: {
      success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      danger: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
      warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-800 dark:text-yellow-400',
      info: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400',
      pending: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
      muted: 'border-border bg-muted/60 text-muted-foreground',
    },
  },
  defaultVariants: { tone: 'muted' },
})

export type BadgeTone = NonNullable<VariantProps<typeof toneBadge>['tone']>

export const toneDotColor = cva('', {
  variants: {
    tone: {
      success: 'bg-emerald-500',
      danger: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-sky-500',
      pending: 'bg-amber-500',
      muted: 'bg-muted-foreground/50',
    },
  },
  defaultVariants: { tone: 'muted' },
})

export const panelCard = cva('flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card', {
  variants: {
    bare: {
      true: 'border-0 bg-transparent',
      false: '',
    },
  },
  defaultVariants: { bare: false },
})

export const siderNavButton = cva('h-10 w-full rounded-lg p-2.5 [&_svg]:size-5', {
  variants: {
    active: {
      true: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary dark:hover:text-primary-foreground',
      false: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    },
    disabled: {
      true: 'opacity-30',
      false: '',
    },
  },
  defaultVariants: { active: false, disabled: false },
})
