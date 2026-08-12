import i18n from '@/app/i18n'

const translate = i18n.t.bind(i18n) as (key: string, params?: Record<string, string>) => string

export function translateStep(messageCode: string, params: Record<string, string> = {}) {
  if (!messageCode) return ''
  const key = `backend.${messageCode}`
  return i18n.exists(key) ? translate(key, params) : messageCode
}
