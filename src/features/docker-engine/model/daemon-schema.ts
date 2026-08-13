import { z } from 'zod'
import type { DaemonSettings, DaemonUpdate } from '@/types/app-bindings'

const mirrorUrlSchema = z
  .string()
  .trim()
  .refine((value) => z.httpUrl().safeParse(value).success, {
    message: 'ui.validation.registryMirror',
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
          message: result.error.issues[0]?.message ?? 'ui.validation.registryMirrorInvalid',
        })
        break
      }
    }

    if (values.log_rotation) {
      if (!values.log_max_size.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['log_max_size'],
          message: 'ui.validation.logSize',
        })
      }

      if (!values.log_max_file.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['log_max_file'],
          message: 'ui.validation.logFiles',
        })
      }
    }

    const socketPath = values.socket_path.trim()
    if (socketPath && !/^(unix|tcp):\/\//.test(socketPath)) {
      ctx.addIssue({
        code: 'custom',
        path: ['socket_path'],
        message: 'ui.validation.socketPath',
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
  password: z.string().min(1, 'ui.validation.sudoPassword'),
})

export type DockerSudoPasswordFormValues = z.infer<typeof dockerSudoPasswordFormSchema>

export function dockerSudoPasswordDefaultValues(): DockerSudoPasswordFormValues {
  return { password: '' }
}
