import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  extra?: ReactNode
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  destructive = false,
  onConfirm,
  extra,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const handleConfirm = () => {
    void Promise.resolve(onConfirm()).finally(() => onOpenChange(false))
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription style={{ textWrap: 'wrap' }}>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {extra ? <div className="mt-1">{extra}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">{cancelText ?? t('ui.common.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} onClick={handleConfirm}>
            {confirmText ?? t('ui.common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
