import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** 删除类操作用 destructive 主按钮 */
  variant?: 'default' | 'destructive'
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
      <DialogContent showCloseButton={false} className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="space-y-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold text-(--text-strong)">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="pt-2 text-(--text-muted) whitespace-pre-line">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">请确认是否继续</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="mx-0 mb-0 gap-2 border-t border-border bg-transparent px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button
            type="button"
            size="sm"
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
