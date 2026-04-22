import { z } from 'zod'

export const imagePullFormSchema = z.object({
  image: z.string().min(1, '请填写镜像引用'),
})

export type ImagePullFormValues = z.infer<typeof imagePullFormSchema>

export const imagePullDefaultValues = (): ImagePullFormValues => ({ image: '' })
