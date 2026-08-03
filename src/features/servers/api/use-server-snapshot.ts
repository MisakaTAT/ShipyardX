import { useCallback, useEffect, useState } from 'react'
import { commands, type DockerEngineInfo } from '@/types/app-bindings'
import { getErrorMessage } from '@/shared/lib/errors'
import {
  readSnapshots,
  removeSnapshot,
  saveSnapshot,
  snapshotFromEngineInfo,
  snapshotFromError,
  type ServerSnapshot,
} from '@/features/servers/model/server-snapshot'

/** 快照变化时通知同一页面内的所有订阅者，localStorage 事件只跨标签页触发。 */
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * 采集一次快照。连接服务器时顺带调用即可，不会产生额外的 SSH 往返之外的开销。
 */
export async function captureSnapshot(serverId: string): Promise<ServerSnapshot> {
  let snapshot: ServerSnapshot
  try {
    await commands.testServerConnection(serverId)
    const info = await commands.checkDockerAccess(serverId)
    snapshot = snapshotFromEngineInfo(info)
  } catch (error) {
    snapshot = snapshotFromError(getErrorMessage(error, '连接失败'))
  }
  saveSnapshot(serverId, snapshot)
  notify()
  return snapshot
}

export function forgetSnapshot(serverId: string) {
  removeSnapshot(serverId)
  notify()
}

/**
 * 连接工作区时顺带记录快照。数据来自已经跑过的查询，不产生额外的 SSH 往返。
 */
export function useRecordServerSnapshot(serverId: string, info: DockerEngineInfo | undefined, error: unknown) {
  useEffect(() => {
    if (info) {
      saveSnapshot(serverId, snapshotFromEngineInfo(info))
      notify()
      return
    }
    if (error) {
      saveSnapshot(serverId, snapshotFromError(getErrorMessage(error, '连接失败')))
      notify()
    }
  }, [serverId, info, error])
}

export function useServerSnapshots() {
  const [snapshots, setSnapshots] = useState(readSnapshots)
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())

  useEffect(() => {
    const listener = () => setSnapshots(readSnapshots())
    listeners.add(listener)
    window.addEventListener('storage', listener)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', listener)
    }
  }, [])

  const refresh = useCallback(async (serverId: string) => {
    setRefreshing((prev) => new Set(prev).add(serverId))
    try {
      await captureSnapshot(serverId)
    } finally {
      setRefreshing((prev) => {
        const next = new Set(prev)
        next.delete(serverId)
        return next
      })
    }
  }, [])

  return { snapshots, refresh, refreshing }
}
