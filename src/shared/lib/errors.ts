import { toast } from '@/shared/components/toast'

export type AppErrorKind =
  | 'validation'
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'unavailable'
  | 'timeout'
  | 'internal'

export interface AppErrorLike {
  code: string
  kind: AppErrorKind
  message: string
  detail?: string | null
  retryable?: boolean
  action?: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAppErrorLike(value: unknown): value is AppErrorLike {
  return (
    isObject(value) &&
    typeof value.code === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.message === 'string'
  )
}

export function normalizeAppError(error: unknown, fallback = '操作失败'): AppErrorLike {
  if (isAppErrorLike(error)) {
    return {
      code: error.code,
      kind: error.kind,
      message: error.message,
      detail: error.detail ?? null,
      retryable: error.retryable ?? false,
      action: error.action ?? null,
    }
  }

  if (error instanceof Error) {
    const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined
    if (isAppErrorLike(cause)) {
      return normalizeAppError(cause, fallback)
    }
    return normalizeAppError(error.message, fallback)
  }

  if (typeof error === 'string') {
    return {
      code: 'internal.error',
      kind: 'internal',
      message: error.trim() || fallback,
      detail: null,
      retryable: false,
      action: null,
    }
  }

  if (isObject(error)) {
    if (typeof error.message === 'string') {
      return normalizeAppError(error.message, fallback)
    }
    if ('error' in error) {
      return normalizeAppError(error.error, fallback)
    }
  }

  return {
    code: 'internal.error',
    kind: 'internal',
    message: fallback,
    detail: null,
    retryable: false,
    action: null,
  }
}

export function getErrorMessage(error: unknown, fallback?: string) {
  return normalizeAppError(error, fallback).message
}

export function getErrorDescription(error: unknown, fallback?: string) {
  const normalized = normalizeAppError(error, fallback)
  const action = normalized.action?.trim()
  if (action) return action

  const detail = normalized.detail?.trim()
  if (detail && detail !== normalized.message) return detail

  return undefined
}

export function getErrorCode(error: unknown) {
  return normalizeAppError(error).code
}

export function hasErrorCode(error: unknown, ...codes: string[]) {
  const code = getErrorCode(error)
  return codes.includes(code)
}

export function isPermissionRelatedError(error: unknown) {
  const normalized = normalizeAppError(error)
  return (
    normalized.kind === 'permission' ||
    normalized.kind === 'auth' ||
    normalized.code.startsWith('system.sudo_') ||
    normalized.code.startsWith('system.service_permission_')
  )
}

export function toastAppError(error: unknown, fallback?: string) {
  toast.error(getErrorMessage(error, fallback), {
    description: getErrorDescription(error, fallback),
  })
}
