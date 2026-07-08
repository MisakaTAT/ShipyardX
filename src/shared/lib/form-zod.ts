import { z } from 'zod'

const archiveFilePattern = /\.(tar|tgz|tar\.gz|gz|xz|tar\.xz|zst|tar\.zst)$/i
const invalidFileNameCharSet = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

function hasInvalidFileNameChars(value: string) {
  for (const char of value) {
    if (invalidFileNameCharSet.has(char)) return true
    const code = char.charCodeAt(0)
    if (code >= 0 && code <= 31) return true
  }
  return false
}

export function trimmedRequiredString(message: string) {
  return z.string().trim().min(1, message)
}

export function safeFileNameSchema(requiredMessage: string, invalidMessage: string) {
  return trimmedRequiredString(requiredMessage).refine(
    (value) => value !== '.' && value !== '..' && !hasInvalidFileNameChars(value),
    {
      message: invalidMessage,
    }
  )
}

export function archiveFilePathSchema(requiredMessage: string, invalidMessage: string) {
  return trimmedRequiredString(requiredMessage).refine((value) => {
    const normalized = value.replace(/\\/g, '/')
    const fileName = normalized.split('/').pop()?.trim()
    return !!fileName && fileName !== '.' && fileName !== '..' && archiveFilePattern.test(fileName)
  }, invalidMessage)
}
