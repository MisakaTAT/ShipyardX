import { useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
  extra?: ReactNode
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  variant = 'destructive',
  extra,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false)

  const handleConfirm = async () => {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent variant="confirm">
        <DialogBody variant="scroll">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-(--text-strong)">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="pt-2 text-(--text-muted) whitespace-pre-line wrap-break-word">
                {description}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">请确认是否继续</DialogDescription>
            )}
            {extra ? <div className={cn('pt-3', pending && 'pointer-events-none opacity-60')}>{extra}</div> : null}
          </DialogHeader>
        </DialogBody>
        <DialogFooter variant="confirm">
          <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() => void handleConfirm()}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
