import type { AppDetail, AppListItem, DescriptionI18n } from '@/types/app-bindings'

/** 商店数据带十几种语言，但界面只有三种，先收敛到这三种再取值 */
export type AppLocale = 'zh' | 'en' | 'ja'

export function appLocale(language: string): AppLocale {
  if (language.startsWith('zh')) return 'zh'
  if (language.startsWith('ja')) return 'ja'
  return 'en'
}

const firstNonEmpty = (...candidates: (string | undefined)[]) => candidates.find((text) => text?.trim()) ?? ''

export function pickAppDescription(description: DescriptionI18n, language: string): string {
  const locale = appLocale(language)
  if (locale === 'zh') return firstNonEmpty(description.zh, description.en)
  if (locale === 'ja') return firstNonEmpty(description.ja, description.en, description.zh)
  return firstNonEmpty(description.en, description.zh)
}

type DescribableApp = Pick<AppListItem, 'description' | 'short_desc_zh' | 'short_desc_en'>

/**
 * data.yml 只有 shortDescZh / shortDescEn 两个短描述字段，日语得回落到
 * description.ja —— 那一栏本身就是各语言的短描述，长度和 shortDesc 相当。
 */
export function pickAppShortDesc(app: DescribableApp, language: string): string {
  const locale = appLocale(language)
  if (locale === 'zh') return firstNonEmpty(app.short_desc_zh, app.description.zh, app.short_desc_en)
  if (locale === 'ja') return firstNonEmpty(app.description.ja, app.short_desc_en, app.description.en)
  return firstNonEmpty(app.short_desc_en, app.description.en, app.description.zh)
}

/**
 * 顶层 tags 是中文分类名，additionalProperties.tags 是英文分类名，两者不是互译，
 * 所以切语言等于换了一套分类，调用方需要把已选中的 tag 一起清掉。
 */
export function pickAppTags(app: Pick<AppListItem, 'tags' | 'tags_en'>, language: string): string[] {
  if (appLocale(language) === 'zh') return app.tags.length ? app.tags : app.tags_en
  return app.tags_en.length ? app.tags_en : app.tags
}

/** 仓库里只有 README.md（中文）和 README_en.md，日语走英文 */
export function pickAppReadme(detail: Pick<AppDetail, 'readme_zh' | 'readme_en'>, language: string): string {
  if (appLocale(language) === 'zh') return firstNonEmpty(detail.readme_zh, detail.readme_en)
  return firstNonEmpty(detail.readme_en, detail.readme_zh)
}
