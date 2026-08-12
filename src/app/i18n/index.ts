import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/app/i18n/locales/en.json'
import ja from '@/app/i18n/locales/ja.json'
import zhCN from '@/app/i18n/locales/zh-CN.json'

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en', 'ja'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** 'system' 表示跟随系统，实际语言在运行时由 resolveLanguage 解析。 */
export type LanguageSetting = SupportedLanguage | 'system'

export const FALLBACK_LANGUAGE: SupportedLanguage = 'en'

/** 语言选择器里的自称名，用各语言自己的写法，不随界面语言变化。 */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語',
}

const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
  ja: { translation: ja },
} as const

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)
}

/**
 * 把 navigator.languages 里的 BCP 47 标签映射到支持的语言。
 */
export function detectSystemLanguage(): SupportedLanguage {
  const candidates = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])

  for (const raw of candidates) {
    const tag = raw?.toLowerCase()
    if (!tag) continue
    if (tag === 'zh' || tag.startsWith('zh-cn') || tag.startsWith('zh-hans')) return 'zh-CN'
    if (tag.startsWith('ja')) return 'ja'
    if (tag.startsWith('en')) return 'en'
  }

  return FALLBACK_LANGUAGE
}

export function resolveLanguage(setting: LanguageSetting): SupportedLanguage {
  return setting === 'system' ? detectSystemLanguage() : setting
}

void i18n.use(initReactI18next).init({
  resources,
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: {
    // React 已经转义了插入的内容，再转义一次会把中日文标点变成实体
    escapeValue: false,
  },
  returnNull: false,
})

export function applyLanguage(setting: LanguageSetting) {
  const language = resolveLanguage(setting)
  if (i18n.language === language) return
  void i18n.changeLanguage(language)
}

export default i18n
