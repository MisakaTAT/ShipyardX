import { describe, expect, it } from 'vitest'
import { imageExportFormSchema } from '@/features/docker-images/model/image-export-schema'
import { imageImportFormSchema } from '@/features/docker-images/model/image-import-schema'

describe('imageExportFormSchema', () => {
  it('rejects empty file names after trimming', () => {
    const result = imageExportFormSchema.safeParse({
      fileName: '   ',
      directory: '/tmp',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('请输入导出文件名')
  })

  it('rejects invalid export file names', () => {
    const result = imageExportFormSchema.safeParse({
      fileName: '../image.tar',
      directory: '/tmp',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('文件名包含非法字符，请重新命名')
  })
})

describe('imageImportFormSchema', () => {
  it('accepts common docker archive file names', () => {
    const result = imageImportFormSchema.safeParse({
      filePath: '/tmp/app-image.tar.gz',
    })

    expect(result.success).toBe(true)
  })

  it('rejects non-archive files', () => {
    const result = imageImportFormSchema.safeParse({
      filePath: '/tmp/readme.txt',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('请选择有效的镜像归档文件')
  })
})
