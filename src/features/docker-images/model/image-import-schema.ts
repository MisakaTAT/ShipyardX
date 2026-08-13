import { z } from 'zod'
import { archiveFilePathSchema } from '@/shared/lib/form-zod'

export const imageImportFormSchema = z.object({
  filePath: archiveFilePathSchema('ui.validation.imageFile', 'ui.validation.imageArchive'),
})

export type ImageImportFormValues = z.infer<typeof imageImportFormSchema>

export function imageImportDefaultValues(): ImageImportFormValues {
  return {
    filePath: '',
  }
}
