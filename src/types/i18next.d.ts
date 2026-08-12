import type zhCN from '@/app/i18n/locales/zh-CN.json'

/**
 * 让 t() 的 key 由词条文件推导：拼错 key 直接编译报错，删词条时调用点也会报错。
 * 以 zh-CN 为准，其他语言由校验脚本保证 key 集合一致。
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof zhCN
    }
    returnNull: false
  }
}
