import { z } from 'zod'
import { trimmedRequiredString } from '@/shared/lib/form-zod'

export const portForwardCreateFormSchema = z.object({
  serverId: trimmedRequiredString('ui.validation.selectHost'),
  containerId: trimmedRequiredString('ui.validation.selectContainer'),
  containerPort: z.number().int().min(1, 'ui.validation.selectContainerPort').max(65535, 'ui.validation.portInvalid'),
  bindAddress: trimmedRequiredString('ui.validation.selectBindAddress'),
  localPort: z.number().int().min(0, 'ui.validation.localPortNegative').max(65535, 'ui.validation.localPortTooLarge'),
})

export type PortForwardCreateFormValues = z.infer<typeof portForwardCreateFormSchema>

export const portForwardCreateDefaultValues = (): PortForwardCreateFormValues => ({
  serverId: '',
  containerId: '',
  containerPort: 0,
  bindAddress: '127.0.0.1',
  localPort: 0,
})
