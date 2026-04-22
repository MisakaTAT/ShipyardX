import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEngineEvents } from '@/shared/api/events/use-engine-events'
import { qk } from './query-keys'

/**
 * 将 Docker 引擎事件流映射为 TanStack Query 的 invalidateQueries。
 * 替代原 Workspace.tsx 中的 refreshTick / refreshTypesRef prop drilling。
 */
export function useDockerEventInvalidation(serverId: string, enabled: boolean) {
  const qc = useQueryClient()

  const { events, status, clearEvents } = useEngineEvents({
    serverId,
    enabled,
    onRefresh: (resource) => {
      // 所有资源变化都顺带刷新引擎概览（计数变化）
      qc.invalidateQueries({ queryKey: qk.dockerInfo(serverId) })
      switch (resource) {
        case 'container':
          qc.invalidateQueries({ queryKey: qk.containers(serverId) })
          break
        case 'image':
          qc.invalidateQueries({ queryKey: qk.images(serverId) })
          break
        case 'network':
          qc.invalidateQueries({ queryKey: qk.networks(serverId) })
          break
        case 'volume':
          qc.invalidateQueries({ queryKey: qk.volumes(serverId) })
          break
        default:
          break
      }
    },
  })

  // 当服务器切换或禁用时，清掉该服务器下所有缓存，避免短暂展示旧数据
  useEffect(() => {
    if (!enabled) return
    return () => {
      qc.removeQueries({ queryKey: ['docker', serverId], exact: false })
    }
  }, [qc, serverId, enabled])

  return { events, status, clearEvents }
}
