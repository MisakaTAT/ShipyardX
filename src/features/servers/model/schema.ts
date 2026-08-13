import { z } from 'zod'
import type { ServerConfig } from '@/types/app-bindings'
import { trimmedRequiredString } from '@/shared/lib/form-zod'

export const serverFormSchema = z
  .object({
    name: trimmedRequiredString('ui.validation.serverName'),
    host: trimmedRequiredString('ui.validation.host'),
    port: z.number().int().min(1, 'ui.validation.portRange').max(65535),
    username: trimmedRequiredString('ui.validation.username'),
    auth_type: z.enum(['key', 'password']),
    password: z.string(),
    key_path: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.auth_type === 'password' && !data.password.trim()) {
      ctx.addIssue({ code: 'custom', message: 'ui.validation.password', path: ['password'] })
    }
    if (data.auth_type === 'key' && !data.key_path.trim()) {
      ctx.addIssue({ code: 'custom', message: 'ui.validation.keyPath', path: ['key_path'] })
    }
  })

export type ServerFormValues = z.infer<typeof serverFormSchema>

export function defaultServerFormValues(): ServerFormValues {
  return {
    name: '',
    host: '',
    port: 22,
    username: 'root',
    auth_type: 'key',
    password: '',
    key_path: '~/.ssh/id_rsa',
  }
}

export function serverConfigToFormValues(s: ServerConfig): ServerFormValues {
  const auth: 'key' | 'password' = s.auth_type === 'password' ? 'password' : 'key'
  return {
    name: s.name,
    host: s.host,
    port: s.port,
    username: s.username,
    auth_type: auth,
    password: s.password ?? '',
    key_path: s.key_path ?? '',
  }
}

export const serverTestConnectionSchema = z
  .object({
    host: trimmedRequiredString('ui.validation.hostFirst'),
    username: trimmedRequiredString('ui.validation.usernameFirst'),
    auth_type: z.enum(['key', 'password']),
    password: z.string(),
    key_path: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.auth_type === 'password' && !data.password.trim()) {
      ctx.addIssue({ code: 'custom', message: 'ui.validation.password', path: ['password'] })
    }
    if (data.auth_type === 'key' && !data.key_path.trim()) {
      ctx.addIssue({ code: 'custom', message: 'ui.validation.keyPath', path: ['key_path'] })
    }
  })

export type ServerTestConnectionValues = z.infer<typeof serverTestConnectionSchema>
