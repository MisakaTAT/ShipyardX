import { z } from 'zod'
import { trimmedRequiredString } from '@/shared/lib/form-zod'
import { isValidFingerprint } from '@/features/host-keys/model/host-key'

export const hostKeyAddFormSchema = z.object({
  host: trimmedRequiredString('ui.validation.host'),
  port: z.number().int().min(1, 'ui.validation.portInvalid').max(65535, 'ui.validation.portTooLarge'),
  fingerprint: trimmedRequiredString('ui.validation.fingerprint').refine(
    isValidFingerprint,
    'ui.validation.fingerprintFormat'
  ),
})

export type HostKeyAddFormValues = z.infer<typeof hostKeyAddFormSchema>

export const hostKeyAddDefaultValues = (): HostKeyAddFormValues => ({
  host: '',
  port: 22,
  fingerprint: '',
})
