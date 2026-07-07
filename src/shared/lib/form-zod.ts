import { z } from 'zod'

const invalidFileNameChars = /[<>:"/\\|?*\u0000-\u001f]/
const archiveFilePattern = /\.(tar|tgz|tar\.gz|gz|xz|tar\.xz|zst|tar\.zst)$/i

export function trimmedRequiredString(message: string) {
  return z.string().trim().min(1, message)
}

export function safeFileNameSchema(requiredMessage: string, invalidMessage: string) {
  return trimmedRequiredString(requiredMessage).refine((value) => value !== '.' && value !== '..' && !invalidFileNameChars.test(value), {
    message: invalidMessage,
  })
}

export function archiveFilePathSchema(requiredMessage: string, invalidMessage: string) {
  return trimmedRequiredString(requiredMessage).refine((value) => {
    const normalized = value.replace(/\\/g, '/')
    const fileName = normalized.split('/').pop()?.trim()
    return !!fileName && fileName !== '.' && fileName !== '..' && archiveFilePattern.test(fileName)
  }, invalidMessage)
}
