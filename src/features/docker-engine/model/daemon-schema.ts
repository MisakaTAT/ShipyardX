import { z } from 'zod'
import type { DaemonSettings, DaemonUpdate } from '@/types/app-bindings'

const mirrorUrlSchema = z
  .string()
  .trim()
  .refine((value) => z.httpUrl().safeParse(value).success, {
    message: '镜像加速地址仅支持合法的 http 或 https 地址',
  })

const cgroupDriverSchema = z.enum(['', 'systemd', 'cgroupfs'])

export const dockerDaemonFormSchema = z
  .object({
    mirrorText: z.string(),
    log_rotation: z.boolean(),
    log_max_size: z.string(),
    log_max_file: z.string(),
    live_restore: z.boolean(),
    cgroup_driver: cgroupDriverSchema,
    socket_path: z.string(),
  })
  .superRefine((values, ctx) => {
    const mirrorLines = values.mirrorText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of mirrorLines) {
      const result = mirrorUrlSchema.safeParse(line)
      if (!result.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['mirrorText'],
          message: result.error.issues[0]?.message ?? '镜像加速地址格式无效',
        })
        break
      }
    }

    if (values.log_rotation) {
      if (!values.log_max_size.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['log_max_size'],
          message: '启用日志切割时，请填写日志大小',
        })
      }

      if (!values.log_max_file.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['log_max_file'],
          message: '启用日志切割时，请填写日志文件数量',
        })
      }
    }

    const socketPath = values.socket_path.trim()
    if (socketPath && !/^(unix|tcp):\/\//.test(socketPath)) {
      ctx.addIssue({
        code: 'custom',
        path: ['socket_path'],
        message: 'Socket 路径需以 unix:// 或 tcp:// 开头',
      })
    }
  })

export type DockerDaemonFormValues = z.infer<typeof dockerDaemonFormSchema>

function normalizeCgroupDriver(value: string): z.infer<typeof cgroupDriverSchema> {
  return cgroupDriverSchema.safeParse(value).success ? (value as z.infer<typeof cgroupDriverSchema>) : ''
}

export function dockerDaemonDefaultValues(): DockerDaemonFormValues {
  return {
    mirrorText: '',
    log_rotation: false,
    log_max_size: '10m',
    log_max_file: '3',
    live_restore: false,
    cgroup_driver: '',
    socket_path: '',
  }
}

export function daemonSettingsToFormValues(data: DaemonSettings): DockerDaemonFormValues {
  return {
    mirrorText: data.mirror_urls.join('\n'),
    log_rotation: data.log_rotation,
    log_max_size: data.log_max_size,
    log_max_file: data.log_max_file,
    live_restore: data.live_restore,
    cgroup_driver: normalizeCgroupDriver(data.cgroup_driver),
    socket_path: data.socket_path === 'unix:///var/run/docker.sock' ? '' : data.socket_path,
  }
}

export function formValuesToDaemonUpdate(values: DockerDaemonFormValues, sudo_password: string | null): DaemonUpdate {
  const mirror_urls = values.mirrorText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    mirror_urls,
    log_rotation: values.log_rotation,
    log_max_size: values.log_max_size.trim(),
    log_max_file: values.log_max_file.trim(),
    live_restore: values.live_restore,
    cgroup_driver: values.cgroup_driver.trim(),
    socket_path: values.socket_path.trim(),
    sudo_password,
  }
}

export const dockerSudoPasswordFormSchema = z.object({
  password: z.string().min(1, '请输入提权密码'),
})

export type DockerSudoPasswordFormValues = z.infer<typeof dockerSudoPasswordFormSchema>

export function dockerSudoPasswordDefaultValues(): DockerSudoPasswordFormValues {
  return { password: '' }
}
