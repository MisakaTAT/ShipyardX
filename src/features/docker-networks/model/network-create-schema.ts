import { z } from 'zod'

const drivers = ['bridge', 'host', 'overlay', 'macvlan', 'ipvlan', 'none'] as const

export const networkCreateFormSchema = z.object({
  name: z.string().min(1, '请填写网络名称'),
  driver: z.enum(drivers),
  subnet: z.string(),
  gateway: z.string(),
  internal: z.boolean(),
  attachable: z.boolean(),
})

export type NetworkCreateFormValues = z.infer<typeof networkCreateFormSchema>

export const networkCreateDefaultValues = (): NetworkCreateFormValues => ({
  name: '',
  driver: 'bridge',
  subnet: '',
  gateway: '',
  internal: false,
  attachable: false,
})
