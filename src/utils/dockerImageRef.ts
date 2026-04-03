import type { Image } from '@/types/app-bindings'

export function imageRefLabel(img: Image): string {
  return img.tag !== '<none>' ? `${img.repository}:${img.tag}` : img.id
}

export function normalizeImageReference(input: string): string {
  const t = input.trim()
  if (!t) return t
  if (t.includes('@')) return t
  if (t.includes(':')) return t
  return `${t}:latest`
}

export function imageRefExistsOnHost(refInput: string, images: Image[]): boolean {
  const norm = normalizeImageReference(refInput).toLowerCase()
  for (const img of images) {
    if (imageRefLabel(img).toLowerCase() === norm) return true
  }
  return false
}

export function listSelectableImageRefs(images: Image[]): string[] {
  const set = new Set<string>()
  for (const img of images) {
    if (img.tag === '<none>') continue
    set.add(imageRefLabel(img))
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
