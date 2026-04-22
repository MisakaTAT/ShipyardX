import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmText?: ReactNode
  cancelText?: ReactNode
  /** 是否为危险操作（红色按钮） */
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  /** 额外嵌入内容，位于 description 与 footer 之间（例如 Checkbox 选项） */
  extra?: ReactNode
}

/**
 * 统一确认/删除对话框。替代各 Panel 里重复的 AlertDialog 拼装。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  destructive = false,
  onConfirm,
  extra,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    void Promise.resolve(onConfirm()).finally(() => onOpenChange(false))
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="whitespace-pre-line">{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {extra ? <div className="mt-1">{extra}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">{cancelText}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} onClick={handleConfirm}>
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
