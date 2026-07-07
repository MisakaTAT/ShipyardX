import type { ComponentProps, ReactNode } from 'react'
import { RequiredFieldLabel, RequiredFieldTitle } from '@/shared/components/form-label'
import { Field, FieldContent, FieldDescription } from '@/shared/ui/field'
import { cn } from '@/shared/lib/utils'

type FieldVariant = 'label' | 'title'

interface FormFieldRowProps extends ComponentProps<typeof Field> {
  label: ReactNode
  htmlFor?: string
  required?: boolean
  invalid?: boolean
  variant?: FieldVariant
  contentClassName?: string
  labelClassName?: string
  description?: ReactNode
  children: ReactNode
}

type FormFieldLabelProps = ComponentProps<typeof RequiredFieldLabel>

export function FormFieldLabel({ className, ...props }: FormFieldLabelProps) {
  return <RequiredFieldLabel className={cn('text-sm font-medium', className)} {...props} />
}

export function FormFieldRow({
  label,
  htmlFor,
  required = false,
  invalid = false,
  variant = 'label',
  className,
  contentClassName,
  labelClassName,
  description,
  children,
  ...props
}: FormFieldRowProps) {
  const renderLabel =
    variant === 'title' ? (
      <RequiredFieldTitle required={required} className={labelClassName}>
        {label}
      </RequiredFieldTitle>
    ) : (
      <RequiredFieldLabel htmlFor={htmlFor} required={required} className={labelClassName}>
        {label}
      </RequiredFieldLabel>
    )

  return (
    <Field data-invalid={invalid} className={className} {...props}>
      {variant === 'label' ? renderLabel : null}
      <FieldContent className={contentClassName}>
        {variant === 'title' ? renderLabel : null}
        {children}
        {description}
      </FieldContent>
    </Field>
  )
}

type FormFieldDescriptionProps = ComponentProps<typeof FieldDescription>

export function FormFieldHint({ className, ...props }: FormFieldDescriptionProps) {
  return <FieldDescription className={cn(className)} {...props} />
}
