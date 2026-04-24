import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { Dialog, DialogContent } from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { fullScreenDialogContent } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'

export interface StandardFullScreenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  title: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  headerActions?: ReactNode

  children: ReactNode

  disableClose?: boolean
  showCloseButton?: boolean
  showHeader?: boolean
  headerClassName?: string
}

export function StandardFullScreenDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  icon: Icon,
  headerActions,
  children,
  disableClose = false,
  showCloseButton = true,
  showHeader = true,
  headerClassName,
}: StandardFullScreenDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && disableClose) return
        onOpenChange(next)
      }}
    >
      <DialogContent className={fullScreenDialogContent} showCloseButton={false}>
        {showHeader ? (
          <div
            className={cn(
              'flex h-11 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3',
              headerClassName
            )}
          >
            {Icon ? (
              <span className="flex shrink-0 text-primary [&_svg]:size-4">
                <Icon />
              </span>
            ) : null}
            <span className="mr-1 text-sm leading-none font-semibold text-foreground">{title}</span>
            {subtitle ? <span className="mr-2 text-xs leading-none text-muted-foreground">{subtitle}</span> : null}

            {headerActions}

            {showCloseButton ? (
              <div className="ml-auto flex items-center gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onOpenChange(false)}
                  disabled={disableClose}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {children}
      </DialogContent>
    </Dialog>
  )
}
