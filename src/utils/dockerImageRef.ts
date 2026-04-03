import type { Image } from '@/types'

/** 与镜像列表展示一致（ImagePanel 内联逻辑与此相同） */
export function imageRefLabel(img: Image): string {
  return img.tag !== '<none>' ? `${img.repository}:${img.tag}` : img.id
}

/** 无 tag 时按 Docker 惯例视为 `:latest`；digest 引用保持原样 */
export function normalizeImageReference(input: string): string {
  const t = input.trim()
  if (!t) return t
  if (t.includes('@')) return t
  if (t.includes(':')) return t
  return `${t}:latest`
}

/** 当前列表中是否已有该引用（与 `imageRefLabel` 逐项比对，忽略大小写） */
export function imageRefExistsOnHost(refInput: string, images: Image[]): boolean {
  const norm = normalizeImageReference(refInput).toLowerCase()
  for (const img of images) {
    if (imageRefLabel(img).toLowerCase() === norm) return true
  }
  return false
}

/** 用于 datalist：有有效 tag 的镜像引用，去重排序 */
export function listSelectableImageRefs(images: Image[]): string[] {
  const set = new Set<string>()
  for (const img of images) {
    if (img.tag === '<none>') continue
    set.add(imageRefLabel(img))
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
