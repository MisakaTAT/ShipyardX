import { z } from 'zod'
import { trimmedRequiredString } from '@/shared/lib/form-zod'

const drivers = ['bridge', 'host', 'overlay', 'macvlan', 'ipvlan', 'none'] as const

export const networkCreateFormSchema = z.object({
  name: trimmedRequiredString('ui.validation.networkName'),
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
