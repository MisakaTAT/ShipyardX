import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { FieldLabel, FieldTitle } from '@/shared/ui/field'

function RequiredMark() {
  return <span aria-hidden="true">*</span>
}

interface RequiredFieldLabelProps extends ComponentProps<typeof FieldLabel> {
  required?: boolean
  children: ReactNode
}

export function RequiredFieldLabel({ required = false, children, className, ...props }: RequiredFieldLabelProps) {
  return (
    <FieldLabel {...props} className={cn('gap-0.5', className)}>
      {children}
      {required ? <RequiredMark /> : null}
    </FieldLabel>
  )
}

interface RequiredFieldTitleProps extends ComponentProps<typeof FieldTitle> {
  required?: boolean
  children: ReactNode
}

export function RequiredFieldTitle({ required = false, children, className, ...props }: RequiredFieldTitleProps) {
  return (
    <FieldTitle {...props} className={cn('gap-0.5', className)}>
      {children}
      {required ? <RequiredMark /> : null}
    </FieldTitle>
  )
}
