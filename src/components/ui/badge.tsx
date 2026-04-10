import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'group/badge inline-flex w-fit shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'border-transparent bg-muted text-muted-foreground [a]:hover:brightness-95',
        destructive:
          'border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20 [a]:hover:bg-destructive/20',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'border-transparent hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
        success: 'border-green-500/30 bg-green-500/10 text-green-500',
        warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
        danger: 'border-red-500/30 bg-red-500/10 text-red-500',
        caution: 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        info: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
        neutral: 'border-border bg-muted text-muted-foreground',
        tag: 'border-blue-500/30 bg-blue-500/10 font-mono text-blue-500',
        protocol: 'border-blue-500/30 bg-blue-500/10 font-mono text-[10px] font-medium text-blue-500 uppercase',
      },
      size: {
        md: 'h-5 min-h-5 gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3',
        pill: 'h-auto min-h-0 gap-1 rounded-full border px-2 py-0.5 text-xs [&>svg]:size-3',
        tag: 'h-auto min-h-0 gap-1 rounded border px-2 py-0.5 text-xs',
        protocol: 'inline-flex h-auto min-h-0 rounded border px-1.5 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

function Badge({
  className,
  variant = 'default',
  size = 'md',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

const statusDotClass: Record<'success' | 'warning' | 'danger' | 'caution' | 'info' | 'neutral', string> = {
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
  caution: 'bg-amber-500',
  info: 'bg-blue-500',
  neutral: 'bg-muted-foreground',
}

type StatusBadgeVariant = keyof typeof statusDotClass

function StatusBadge({
  variant,
  pulse,
  dotClassName,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children'> & {
  variant: StatusBadgeVariant
  pulse?: boolean
  dotClassName?: string
  children: React.ReactNode
}) {
  return (
    <Badge variant={variant} size="pill" className={className} {...props}>
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          statusDotClass[variant],
          pulse && 'animate-pulse',
          dotClassName
        )}
      />
      {children}
    </Badge>
  )
}

const CONTAINER_STATE_LABEL: Record<string, string> = {
  created: '已创建',
  running: '运行中',
  paused: '已暂停',
  restarting: '重启中',
  removing: '删除中',
  exited: '已停止',
  dead: '已停止',
}

type ContainerStateTone = 'success' | 'danger' | 'warning' | 'caution' | 'info' | 'neutral'

function containerStateTone(state: string): ContainerStateTone {
  const s = state.toLowerCase().trim()
  if (s === 'running') return 'success'
  if (s === 'exited' || s === 'dead') return 'danger'
  if (s === 'paused') return 'warning'
  if (s === 'restarting' || s === 'removing') return 'caution'
  if (s === 'created') return 'info'
  return 'neutral'
}

function ContainerStateBadge({ state }: { state: string }) {
  const s = state.toLowerCase().trim()
  const label = CONTAINER_STATE_LABEL[s] ?? state
  const tone = containerStateTone(state)
  const pulse = tone === 'success' || tone === 'caution'

  if (tone === 'neutral') {
    return (
      <StatusBadge variant="neutral" dotClassName="bg-muted-foreground">
        {label}
      </StatusBadge>
    )
  }

  return (
    <StatusBadge variant={tone} pulse={pulse}>
      {label}
    </StatusBadge>
  )
}

function PortForwardStatusBadge({ running, enabled }: { running?: boolean; enabled: boolean }) {
  if (running) {
    return (
      <StatusBadge variant="success" pulse>
        监听中
      </StatusBadge>
    )
  }
  if (enabled) {
    return <StatusBadge variant="caution">待启动</StatusBadge>
  }
  return (
    <StatusBadge variant="neutral" dotClassName="bg-muted-foreground/40">
      已禁用
    </StatusBadge>
  )
}

export { Badge, badgeVariants, ContainerStateBadge, PortForwardStatusBadge, StatusBadge }
