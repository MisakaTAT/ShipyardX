import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { modalDialogContent } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'

export interface StandardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  icon?: LucideIcon
  headerActions?: ReactNode
  children: ReactNode
  footer?: ReactNode

  widthClassName?: string

  disableClose?: boolean
  showCloseButton?: boolean
}

export function StandardDialog({
  open,
  onOpenChange,
  title,
  icon: Icon,
  headerActions,
  children,
  footer,
  widthClassName = 'w-[520px]',
  disableClose = false,
  showCloseButton = true,
}: StandardDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && disableClose) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        className={cn(modalDialogContent, 'max-h-[80vh]', widthClassName, 'max-w-none!')}
        showCloseButton={false}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          {Icon ? (
            <span className="flex shrink-0 text-primary [&_svg]:size-4">
              <Icon />
            </span>
          ) : null}
          <DialogTitle className="flex-1 text-[15px] leading-none font-semibold text-foreground">{title}</DialogTitle>

          {headerActions}

          {showCloseButton ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              disabled={disableClose}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>

        {footer ? <div className="shrink-0 border-t border-border bg-muted/20 px-3 py-3">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  )
}
