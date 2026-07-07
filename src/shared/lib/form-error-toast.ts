import type { FieldErrors, FieldValues, SubmitErrorHandler, SubmitHandler, UseFormReturn } from 'react-hook-form'
import { toast } from '@/shared/components/toast'

function findFirstErrorMessage(error: unknown): string | null {
  if (!error) return null

  if (Array.isArray(error)) {
    for (const item of error) {
      const message = findFirstErrorMessage(item)
      if (message) return message
    }
    return null
  }

  if (typeof error !== 'object') return null

  const record = error as Record<string, unknown>
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message
  }

  for (const value of Object.values(record)) {
    const message = findFirstErrorMessage(value)
    if (message) return message
  }

  return null
}

export function getFirstFormErrorMessage<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  fallback = '表单校验失败，请检查后重试'
) {
  return findFirstErrorMessage(errors) ?? fallback
}

export function toastFormErrors<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  fallback?: string
) {
  toast.warning(getFirstFormErrorMessage(errors, fallback))
}

export function createToastFormSubmit<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  onValid: SubmitHandler<TFieldValues>,
  fallback?: string
) {
  const onInvalid: SubmitErrorHandler<TFieldValues> = (errors) => {
    toastFormErrors(errors, fallback)
  }

  return form.handleSubmit(onValid, onInvalid)
}
