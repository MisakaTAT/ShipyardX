import 'sonner/dist/styles.css'

import { useSyncExternalStore } from 'react'
import { Toaster as Sonner, type ToasterProps, type ToastClassnames } from 'sonner'
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'

function subscribeHtmlClass(onChange: () => void) {
  const el = document.documentElement
  const observer = new MutationObserver(onChange)
  observer.observe(el, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function getColorMode(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

const defaultToastClassNames: ToastClassnames = {
  toast: cn('border border-border bg-popover text-popover-foreground shadow-md', 'rounded-xl backdrop-blur-sm'),
  title: 'text-sm font-semibold text-foreground',
  description: 'text-xs leading-relaxed text-muted-foreground',
  content: 'gap-1',
  icon: 'shrink-0',
  success: '[&_[data-icon]]:text-emerald-600 dark:[&_[data-icon]]:text-emerald-400',
  error: '[&_[data-icon]]:text-destructive',
  info: '[&_[data-icon]]:text-primary',
  warning: '[&_[data-icon]]:text-amber-600 dark:[&_[data-icon]]:text-amber-400',
  loading: '[&_[data-icon]]:text-muted-foreground',
}

export function Toaster({ theme: themeProp, className, toastOptions, closeButton = false, ...props }: ToasterProps) {
  const syncedTheme = useSyncExternalStore(subscribeHtmlClass, getColorMode, () => 'dark' as const)
  const theme = (themeProp ?? syncedTheme) as NonNullable<ToasterProps['theme']>

  const mergedClassNames: ToastClassnames = {
    ...toastOptions?.classNames,
    toast: cn(defaultToastClassNames.toast, toastOptions?.classNames?.toast),
    title: cn(defaultToastClassNames.title, toastOptions?.classNames?.title),
    description: cn(defaultToastClassNames.description, toastOptions?.classNames?.description),
    content: cn(defaultToastClassNames.content, toastOptions?.classNames?.content),
    icon: cn(defaultToastClassNames.icon, toastOptions?.classNames?.icon),
    success: cn(defaultToastClassNames.success, toastOptions?.classNames?.success),
    error: cn(defaultToastClassNames.error, toastOptions?.classNames?.error),
    info: cn(defaultToastClassNames.info, toastOptions?.classNames?.info),
    warning: cn(defaultToastClassNames.warning, toastOptions?.classNames?.warning),
    loading: cn(defaultToastClassNames.loading, toastOptions?.classNames?.loading),
  }

  return (
    <Sonner
      theme={theme}
      closeButton={closeButton}
      className={cn('toaster group', className)}
      richColors={false}
      icons={{
        success: <CircleCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />,
        info: <InfoIcon className="size-4 text-primary" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-600 dark:text-amber-400" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: mergedClassNames,
      }}
      {...props}
    />
  )
}
