import { cva, type VariantProps } from 'class-variance-authority'

/**
 * 通用状态圆点。配合 StatusBadge 组件使用。
 */
export const statusDot = cva('inline-block size-1.5 shrink-0 rounded-full', {
  variants: {
    tone: {
      success: 'bg-green-500',
      danger: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-blue-500',
      pending: 'bg-amber-500',
      muted: 'bg-muted-foreground/40',
    },
    pulse: { true: 'animate-pulse', false: '' },
  },
  defaultVariants: { tone: 'muted', pulse: false },
})

export type StatusTone = NonNullable<VariantProps<typeof statusDot>['tone']>

/**
 * 状态徽章外壳。
 */
export const statusBadge = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none whitespace-nowrap',
  {
    variants: {
      tone: {
        success: 'border-border',
        danger: 'border-border',
        warning: 'border-border',
        info: 'border-border',
        pending: 'border-border',
        muted: 'border-border',
      },
    },
    defaultVariants: { tone: 'muted' },
  }
)

/**
 * 面板卡片容器（表格类面板的外层）。
 */
export const panelCard = cva(
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card',
  {
    variants: {
      bare: {
        true: 'border-0 bg-transparent',
        false: '',
      },
    },
    defaultVariants: { bare: false },
  }
)

/**
 * Sider 导航按钮激活态。取代 bg-[color-mix(...)] 内联写法。
 */
export const siderNavButton = cva('h-10 w-full rounded-lg p-2.5 [&_svg]:size-5', {
  variants: {
    active: {
      true: 'bg-sidebar-nav-active-bg text-primary hover:bg-sidebar-nav-active-bg-hover hover:text-primary',
      false: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    },
    disabled: {
      true: 'opacity-30',
      false: '',
    },
  },
  defaultVariants: { active: false, disabled: false },
})
