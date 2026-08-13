import { z } from 'zod'
import { trimmedRequiredString } from '@/shared/lib/form-zod'

export const volumeCreateFormSchema = z
  .object({
    name: trimmedRequiredString('ui.validation.volumeName'),
    driver: z.literal('local'),
    enableNfs: z.boolean(),
    nfsAddr: z.string(),
    nfsVersion: z.string(),
    nfsMount: z.string(),
    nfsOptions: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.enableNfs) return
    if (!data.nfsAddr.trim()) {
      ctx.addIssue({ code: 'custom', message: 'ui.validation.nfsAddr', path: ['nfsAddr'] })
    }
    if (!data.nfsMount.trim()) {
      ctx.addIssue({ code: 'custom', message: 'ui.validation.nfsMount', path: ['nfsMount'] })
    }
  })

export type VolumeCreateFormValues = z.infer<typeof volumeCreateFormSchema>

export const volumeCreateDefaultValues = (): VolumeCreateFormValues => ({
  name: '',
  driver: 'local',
  enableNfs: false,
  nfsAddr: '',
  nfsVersion: '',
  nfsMount: '',
  nfsOptions: 'rw,noatime,rsize=8192,wsize=8192,tcp,timeo=14',
})
