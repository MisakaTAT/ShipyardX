import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { APP_PATHS } from '@/shared/lib/app-router'

export type PaletteGroup = 'server' | 'forward' | 'hostKey' | 'app' | 'command'

export const GROUP_LABELS: Record<PaletteGroup, string> = {
  server: '连接',
  forward: '转发',
  hostKey: '指纹',
  app: '应用',
  command: '命令',
}

export const GROUP_ORDER: PaletteGroup[] = ['server', 'forward', 'hostKey', 'app', 'command']

export const GROUP_PATHS: Partial<Record<PaletteGroup, string>> = {
  server: APP_PATHS.workspace,
  forward: APP_PATHS.portForward,
  hostKey: APP_PATHS.hostKeys,
  app: APP_PATHS.store,
}

export interface PaletteItem {
  id: string
  group: PaletteGroup
  title: string
  subtitle?: string
  icon: ComponentType<LucideProps>
  /** 参与匹配但不显示，例如主机地址、指纹、拼音无关的英文别名 */
  keywords?: string
  /** more 是每组末尾的「查看全部」，样式和数据条目区分开 */
  variant?: 'more'
  run: () => void
}

export function withQuery(path: string, query: string) {
  const q = query.trim()
  return q ? `${path}?q=${encodeURIComponent(q)}` : path
}

function score(item: PaletteItem, query: string) {
  const title = item.title.toLowerCase()
  if (title === query) return 0
  if (title.startsWith(query)) return 1
  if (title.includes(query)) return 2
  if ((item.subtitle ?? '').toLowerCase().includes(query)) return 3
  if ((item.keywords ?? '').toLowerCase().includes(query)) return 4
  return -1
}

/**
 * 子串匹配而非模糊匹配：这里的内容是 IP、端口、指纹这类精确串，
 * 模糊匹配会把 "22" 匹配到一堆无关条目上。
 */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items

  return items
    .map((item) => ({ item, rank: score(item, q) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item)
}

export interface PaletteGroupResult {
  group: PaletteGroup
  items: PaletteItem[]
  /** 被截断掉的条数，供「查看全部」显示 */
  hidden: number
}

export function groupItems(items: PaletteItem[], perGroupLimit = 3): PaletteGroupResult[] {
  return GROUP_ORDER.map((group) => {
    const all = items.filter((item) => item.group === group)
    const limit = group === 'command' ? all.length : perGroupLimit
    return { group, items: all.slice(0, limit), hidden: Math.max(0, all.length - limit) }
  }).filter(({ items }) => items.length > 0)
}
