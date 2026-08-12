import { useEffect, useState } from 'react'
import type { DockerEngineInfo } from '@/types/app-bindings'
import {
  readServerOsMap,
  removeServerOs,
  saveServerOs,
  type ServerOsMap,
} from '@/features/servers/model/server-os-cache'

/** 缓存变化时通知同一页面内的所有订阅者，localStorage 事件只跨标签页触发。 */
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function forgetServerOs(serverId: string) {
  removeServerOs(serverId)
  notify()
}

/**
 * 连接工作区时顺带记录系统名。数据来自已经跑过的查询，不产生额外的 SSH 往返。
 */
export function useRecordServerOs(serverId: string, info: DockerEngineInfo | undefined) {
  useEffect(() => {
    if (!info?.os) return
    saveServerOs(serverId, info.os)
    notify()
  }, [serverId, info])
}

export function useServerOsMap(): ServerOsMap {
  const [osMap, setOsMap] = useState(readServerOsMap)

  useEffect(() => {
    const listener = () => setOsMap(readServerOsMap())
    listeners.add(listener)
    window.addEventListener('storage', listener)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', listener)
    }
  }, [])

  return osMap
}
