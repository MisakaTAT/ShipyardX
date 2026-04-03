import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { XIcon } from 'lucide-react'

const dialogContentAnimate =
  'duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0'

const dialogContentVariants = {
  panel:
    'fixed top-1/2 left-1/2 z-50 flex max-h-[min(92vh,calc(100dvh-2rem))] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-xl border border-(--border-sub) bg-(--bg-overlay) p-0 text-sm text-(--text-base) shadow-2xl ring-0 sm:max-w-lg',
  panelMd:
    'fixed top-1/2 left-1/2 z-50 flex max-h-[min(92vh,calc(100dvh-2rem))] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-xl border border-(--border-sub) bg-(--bg-overlay) p-0 text-sm text-(--text-base) shadow-2xl ring-0 sm:max-w-md',
  panelXl:
    'fixed top-1/2 left-1/2 z-50 flex max-h-[min(92vh,calc(100dvh-2rem))] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-xl border border-(--border-sub) bg-(--bg-overlay) p-0 text-sm text-(--text-base) shadow-2xl ring-0 sm:max-w-xl',
  runContainer:
    'fixed top-1/2 left-1/2 z-50 flex max-h-[min(92vh,900px)] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-xl border border-(--border-sub) bg-(--bg-overlay) p-0 text-sm text-(--text-base) shadow-2xl ring-0',
  fullscreen:
    'fixed! inset-0! left-0! top-0! z-50 flex! h-dvh max-h-dvh w-full max-w-full translate-x-0! translate-y-0! flex-col gap-0 overflow-hidden rounded-none border-0 bg-(--bg-overlay) p-0 text-sm text-(--text-base) shadow-none sm:max-w-full',
  confirm:
    'fixed top-1/2 left-1/2 z-50 flex max-h-[min(85vh,calc(100dvh-2rem))] min-h-0 w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-xl border border-(--border-sub) bg-(--bg-overlay) p-0 text-sm text-(--text-base) shadow-2xl ring-0 sm:max-w-md',
} as const

export type DialogContentVariant = keyof typeof dialogContentVariants

const dialogBodyVariants = {
  default: 'p-4',
  scroll: 'min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-0',
  stack: 'space-y-4 p-4',
  stackSm: 'space-y-3 p-4',
  split: 'flex flex-col p-0',
} as const

export type DialogBodyVariant = keyof typeof dialogBodyVariants

const dialogFooterVariants = {
  confirm:
    'mx-0 mb-0 flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-(--bg-surface)/40 px-6 pt-3 pb-4 sm:flex-row sm:justify-end',
  panelSplit: 'shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3',
  actionsEnd: 'shrink-0 justify-end gap-2 border-t border-border px-4 py-3',
} as const

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/60 duration-100 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton,
  variant,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** 自定义顶栏时一般为 `false`（由 HeaderBar 等提供关闭） */
  showCloseButton?: boolean
  variant: DialogContentVariant
}) {
  const resolvedShowClose = showCloseButton ?? false
  const variantClass = dialogContentVariants[variant]

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(variantClass, dialogContentAnimate, className)}
        {...props}
      >
        {children}
        {resolvedShowClose && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" icon className="absolute top-2 right-2">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 space-y-0 px-6 pt-5 pb-4', className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  variant: keyof typeof dialogFooterVariants
}) {
  return (
    <div data-slot="dialog-footer" className={cn('flex', dialogFooterVariants[variant], className)} {...props}>
      {children}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogCloseIconButton({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <Button
      type="button"
      variant="ghost"
      icon
      className={cn('text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)', className)}
      aria-label="关闭"
      {...props}
    >
      <XIcon className="size-4" />
    </Button>
  )
}

function DialogHeaderBar({
  icon,
  title,
  onClose,
  closeDisabled,
  headerTrailing,
  titleClassName,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  onClose?: () => void
  closeDisabled?: boolean
  headerTrailing?: React.ReactNode
  titleClassName?: string
  className?: string
}) {
  return (
    <div
      data-slot="dialog-header-bar"
      className={cn('flex shrink-0 flex-row items-center gap-2 border-b border-border px-4 py-3', className)}
    >
      {icon != null ? (
        <span className="flex shrink-0 text-(--accent-text) [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      ) : null}
      <DialogTitle className={cn('flex-1 text-sm font-semibold leading-none text-(--text-strong)', titleClassName)}>
        {title}
      </DialogTitle>
      {headerTrailing != null ? (
        headerTrailing
      ) : onClose != null ? (
        <DialogCloseIconButton onClick={onClose} disabled={closeDisabled} />
      ) : null}
    </div>
  )
}

function DialogPanelToolbar({ className, style, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-panel-toolbar"
      className={cn('flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3', className)}
      style={{ background: 'var(--bg-panel)', ...style }}
      {...props}
    />
  )
}

function DialogPanelToolbarIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 text-(--accent-text) [&_svg]:size-4" aria-hidden>
      {children}
    </span>
  )
}

/** 全屏弹窗主内容区（日志 / 编辑器） */
function DialogFullscreenBody({
  tone,
  className,
  style,
  ...props
}: React.ComponentProps<'div'> & {
  tone: 'log' | 'editor'
}) {
  const bg = tone === 'log' ? '#0d1117' : '#1e1e1e'
  return (
    <div
      data-slot="dialog-fullscreen-body"
      className={cn('relative min-h-0 flex-1 overflow-hidden', className)}
      style={{ background: bg, ...style }}
      {...props}
    />
  )
}

function DialogLoadingOverlay({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-loading-overlay"
      className={cn('absolute inset-0 z-10 flex items-center justify-center bg-black/40', className)}
      {...props}
    >
      <div className="flex items-center gap-2 text-sm text-(--text-soft)">
        <div className="size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        {children}
      </div>
    </div>
  )
}

function DialogPanelTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dialog-panel-title"
      className={cn('mr-1 font-mono text-sm font-semibold text-(--text-strong)', className)}
      {...props}
    />
  )
}

function DialogPanelMeta({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="dialog-panel-meta" className={cn('mr-2 text-xs text-(--text-muted)', className)} {...props} />
}

function DialogPanelToolbarEnd({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-panel-toolbar-end" className={cn('ml-auto flex items-center gap-2', className)} {...props} />
  )
}

function DialogBody({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & {
  variant?: DialogBodyVariant
}) {
  return <div data-slot="dialog-body" className={cn(dialogBodyVariants[variant], className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogCloseIconButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogFullscreenBody,
  DialogHeader,
  DialogHeaderBar,
  DialogLoadingOverlay,
  DialogPanelMeta,
  DialogPanelTitle,
  DialogPanelToolbar,
  DialogPanelToolbarEnd,
  DialogPanelToolbarIcon,
  DialogTitle,
}
