import type { ReactNode } from 'react'
import { CircleCheckIcon, InfoIcon, Loader2Icon, CircleAlertIcon, CircleAlert } from 'lucide-react'
import { toast as sonnerToast, type ExternalToast } from 'sonner'
import { cn } from '@/shared/lib/utils'

type ToastKind = 'success' | 'error' | 'warning' | 'info' | 'loading'

const TOAST_KIND_STYLES: Record<ToastKind, string> = {
  success:
    'border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 [&_[data-toast-icon]]:text-emerald-600 dark:[&_[data-toast-icon]]:text-emerald-300',
  error:
    'border-red-500/25 bg-red-500/10 text-red-950 dark:text-red-100 [&_[data-toast-icon]]:text-red-600 dark:[&_[data-toast-icon]]:text-red-300',
  warning:
    'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100 [&_[data-toast-icon]]:text-amber-600 dark:[&_[data-toast-icon]]:text-amber-300',
  info: 'border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100 [&_[data-toast-icon]]:text-sky-600 dark:[&_[data-toast-icon]]:text-sky-300',
  loading: 'border-primary/20 bg-primary/8 text-foreground [&_[data-toast-icon]]:text-primary',
}

function renderIcon(kind: ToastKind) {
  const iconClassName = kind === 'loading' ? 'size-4 animate-spin' : 'size-4'
  const icon =
    kind === 'success' ? (
      <CircleCheckIcon className={iconClassName} />
    ) : kind === 'error' ? (
      <CircleAlertIcon className={iconClassName} />
    ) : kind === 'warning' ? (
      <CircleAlert className={iconClassName} />
    ) : kind === 'info' ? (
      <InfoIcon className={iconClassName} />
    ) : (
      <Loader2Icon className={iconClassName} />
    )

  return (
    <span data-toast-icon className="inline-flex size-5 shrink-0 items-center justify-center">
      {icon}
    </span>
  )
}

function buildOptions(kind: ToastKind, options?: ExternalToast): ExternalToast {
  return {
    ...options,
    icon: options?.icon ?? renderIcon(kind),
    className: cn('rounded-xl border shadow-lg backdrop-blur-sm', TOAST_KIND_STYLES[kind], options?.className),
    descriptionClassName: cn('text-current/75', options?.descriptionClassName),
  }
}

function show(kind: ToastKind, message: ReactNode, options?: ExternalToast) {
  return sonnerToast[kind](message, buildOptions(kind, options))
}

export const toast = {
  success: (message: ReactNode, options?: ExternalToast) => show('success', message, options),
  error: (message: ReactNode, options?: ExternalToast) => show('error', message, options),
  warning: (message: ReactNode, options?: ExternalToast) => show('warning', message, options),
  info: (message: ReactNode, options?: ExternalToast) => show('info', message, options),
  loading: (message: ReactNode, options?: ExternalToast) => show('loading', message, options),
  dismiss: sonnerToast.dismiss,
}
