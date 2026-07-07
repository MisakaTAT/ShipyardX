import { z } from 'zod'
import { archiveFilePathSchema } from '@/shared/lib/form-zod'

export const imageImportFormSchema = z.object({
  filePath: archiveFilePathSchema('请选择镜像文件', '请选择有效的镜像归档文件'),
})

export type ImageImportFormValues = z.infer<typeof imageImportFormSchema>

export function imageImportDefaultValues(): ImageImportFormValues {
  return {
    filePath: '',
  }
}
