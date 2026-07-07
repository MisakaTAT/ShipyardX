import { z } from 'zod'
import type { Image } from '@/types/app-bindings'
import { safeFileNameSchema, trimmedRequiredString } from '@/shared/lib/form-zod'

export const imageExportFormSchema = z.object({
  fileName: safeFileNameSchema('请输入导出文件名', '文件名包含非法字符，请重新命名'),
  directory: trimmedRequiredString('请选择导出目录'),
})

export type ImageExportFormValues = z.infer<typeof imageExportFormSchema>

export function imageExportDefaultValues(image: Image | null): ImageExportFormValues {
  return {
    fileName: image ? buildDefaultExportFileName(image) : 'image.tar',
    directory: '',
  }
}

function buildDefaultExportFileName(image: Image) {
  const raw = image.tag !== '<none>' ? `${image.repository}_${image.tag}` : image.id.replace(/^sha256:/, 'image_')

  const safe = raw
    .split('')
    .map((char) => sanitizeFileChar(char))
    .join('')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')

  return `${safe || 'image'}.tar`
}

function sanitizeFileChar(char: string) {
  if (!char) return ''
  const code = char.charCodeAt(0)
  if (code < 32) return '_'
  return /[<>:"/\\|?*]/.test(char) ? '_' : char
}
