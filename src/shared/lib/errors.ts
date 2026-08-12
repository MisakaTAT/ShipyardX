import i18n from '@/app/i18n'
import { toast } from '@/shared/components/toast'
import type { AppError, AppErrorKind } from '@/types/app-bindings'

export type { AppErrorKind }

export interface ResolvedAppError extends AppError {
  message: string
  action: string | null
}

const translate = i18n.t.bind(i18n) as (key: string, params?: Record<string, string>) => string

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAppError(value: unknown): value is AppError {
  return isObject(value) && typeof value.code === 'string' && typeof value.kind === 'string'
}

function emptyError(fallbackMessage?: string): AppError {
  return {
    code: 'internal.error',
    kind: 'internal',
    params: {},
    detail: fallbackMessage ?? null,
    retryable: false,
  }
}

export function normalizeAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return {
      code: error.code,
      kind: error.kind,
      params: error.params ?? {},
      detail: error.detail ?? null,
      retryable: error.retryable ?? false,
    }
  }

  if (error instanceof Error) {
    const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined
    if (isAppError(cause)) return normalizeAppError(cause)
    return emptyError(error.message)
  }

  if (typeof error === 'string') return emptyError(error.trim() || undefined)

  if (isObject(error)) {
    if ('error' in error) return normalizeAppError(error.error)
    if (typeof error.message === 'string') return emptyError(error.message)
  }

  return emptyError()
}

export function resolveAppError(error: unknown, fallback?: string): ResolvedAppError {
  const normalized = normalizeAppError(error)
  const base = `backend.errors.${normalized.code}`
  const hasEntry = i18n.exists(`${base}.message`)

  const message = hasEntry
    ? translate(`${base}.message`, normalized.params)
    : (fallback ?? normalized.detail ?? translate('backend.errors.unknown.message'))

  const action = i18n.exists(`${base}.action`) ? translate(`${base}.action`, normalized.params) : null

  return {
    ...normalized,
    message,
    action,
    detail: hasEntry ? normalized.detail : (normalized.detail ?? normalized.code),
  }
}

export function getErrorMessage(error: unknown, fallback?: string) {
  return resolveAppError(error, fallback).message
}

export function getErrorDescription(error: unknown, fallback?: string) {
  const resolved = resolveAppError(error, fallback)
  const action = resolved.action?.trim()
  if (action) return action

  const detail = resolved.detail?.trim()
  if (detail && detail !== resolved.message) return detail

  return undefined
}

export function getErrorCode(error: unknown) {
  return normalizeAppError(error).code
}

export function hasErrorCode(error: unknown, ...codes: string[]) {
  return codes.includes(getErrorCode(error))
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
