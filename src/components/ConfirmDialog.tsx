import { useState, type ReactNode } from 'react'
import {
  Dialog,
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
  /** 删除类操作用 destructive 主按钮 */
  variant?: 'default' | 'destructive'
  /** 标题与说明下方的附加内容（如选项） */
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
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(85vh,calc(100dvh-2rem))] min-h-0 w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <DialogHeader className="space-y-0 px-6 pt-5 pb-4">
            <DialogTitle className="text-base font-semibold text-(--text-strong)">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="pt-2 text-(--text-muted) whitespace-pre-line wrap-break-word">
                {description}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">请确认是否继续</DialogDescription>
            )}
            {extra ? (
              <div className={cn('pt-3', pending && 'pointer-events-none opacity-60')}>{extra}</div>
            ) : null}
          </DialogHeader>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 bg-(--bg-surface)/40 px-6 pt-3 pb-4 sm:flex-row sm:justify-end">
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
