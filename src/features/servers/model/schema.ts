import { z } from 'zod'
import type { ServerConfig } from '@/types/app-bindings'
import { trimmedRequiredString } from '@/shared/lib/form-zod'

export const serverFormSchema = z
  .object({
    name: trimmedRequiredString('请填写服务器名称'),
    host: trimmedRequiredString('请填写主机地址'),
    port: z.number().int().min(1, '端口须在 1–65535').max(65535),
    username: trimmedRequiredString('请填写用户名'),
    auth_type: z.enum(['key', 'password']),
    password: z.string(),
    key_path: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.auth_type === 'password' && !data.password.trim()) {
      ctx.addIssue({ code: 'custom', message: '请填写密码', path: ['password'] })
    }
    if (data.auth_type === 'key' && !data.key_path.trim()) {
      ctx.addIssue({ code: 'custom', message: '请填写密钥路径', path: ['key_path'] })
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
    host: trimmedRequiredString('请先填写主机地址'),
    username: trimmedRequiredString('请先填写用户名'),
    auth_type: z.enum(['key', 'password']),
    password: z.string(),
    key_path: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.auth_type === 'password' && !data.password.trim()) {
      ctx.addIssue({ code: 'custom', message: '请填写密码', path: ['password'] })
    }
    if (data.auth_type === 'key' && !data.key_path.trim()) {
      ctx.addIssue({ code: 'custom', message: '请填写密钥路径', path: ['key_path'] })
    }
  })

export type ServerTestConnectionValues = z.infer<typeof serverTestConnectionSchema>
