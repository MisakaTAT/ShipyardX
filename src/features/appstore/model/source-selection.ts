import { useCallback, useEffect, useState } from 'react'
import type { LocalAppstoreSource } from '@/shared/lib/appstore-settings'

const STORAGE_KEY = 'shipyardx-appstore-source'

/** localStorage 的 storage 事件只跨标签页触发，同页面内要自己广播 */
const listeners = new Set<() => void>()

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function write(sourceId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, sourceId)
  } catch {}
  for (const listener of listeners) listener()
}

/**
 * 源选择提到页面之外：命令面板要和应用商店页看同一个源，
 * 否则默认启用两个源时，面板搜的是第一个、页面显示的是另一个。
 */
export function useSelectedAppSource(enabledSources: LocalAppstoreSource[]) {
  const [stored, setStored] = useState(read)

  useEffect(() => {
    const listener = () => setStored(read())
    listeners.add(listener)
    window.addEventListener('storage', listener)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', listener)
    }
  }, [])

  // 存下的源可能已被禁用或删除，回落到第一个可用的
  const activeSourceId = enabledSources.find((source) => source.id === stored)?.id ?? enabledSources[0]?.id ?? ''

  return [activeSourceId, useCallback((sourceId: string) => write(sourceId), [])] as const
}
