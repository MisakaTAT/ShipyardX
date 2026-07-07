import { describe, expect, it } from 'vitest'
import { serverFormSchema, serverTestConnectionSchema } from '@/features/servers/model/schema'

describe('serverFormSchema', () => {
  it('rejects whitespace-only required fields', () => {
    const result = serverFormSchema.safeParse({
      name: '   ',
      host: '   ',
      port: 22,
      username: '   ',
      auth_type: 'key',
      password: '',
      key_path: '~/.ssh/id_rsa',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['请填写服务器名称', '请填写主机地址', '请填写用户名']),
    )
  })
})

describe('serverTestConnectionSchema', () => {
  it('requires password when password auth is selected', () => {
    const result = serverTestConnectionSchema.safeParse({
      host: '10.0.0.8',
      username: 'root',
      auth_type: 'password',
      password: '   ',
      key_path: '',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('请填写密码')
  })
})
