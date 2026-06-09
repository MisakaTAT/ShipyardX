import { z } from 'zod'

export const imageImportFormSchema = z.object({
  filePath: z.string().trim().min(1, '请选择镜像文件'),
})

export type ImageImportFormValues = z.infer<typeof imageImportFormSchema>

export function imageImportDefaultValues(): ImageImportFormValues {
  return {
    filePath: '',
  }
}
