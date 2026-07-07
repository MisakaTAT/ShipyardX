import { z } from 'zod'
import { trimmedRequiredString } from '@/shared/lib/form-zod'

export const imagePullFormSchema = z.object({
  image: trimmedRequiredString('请填写镜像引用'),
})

export type ImagePullFormValues = z.infer<typeof imagePullFormSchema>

export const imagePullDefaultValues = (): ImagePullFormValues => ({ image: '' })
