import { z } from 'zod'
import { trimmedRequiredString } from '@/shared/lib/form-zod'
import { isValidFingerprint } from '@/features/host-keys/model/host-key'

export const hostKeyAddFormSchema = z.object({
  host: trimmedRequiredString('请填写主机地址'),
  port: z.number().int().min(1, '端口无效').max(65535, '端口不能超过 65535'),
  fingerprint: trimmedRequiredString('请填写指纹').refine(isValidFingerprint, '指纹格式应为 SHA256:<43 位 base64>'),
})

export type HostKeyAddFormValues = z.infer<typeof hostKeyAddFormSchema>

export const hostKeyAddDefaultValues = (): HostKeyAddFormValues => ({
  host: '',
  port: 22,
  fingerprint: '',
})
