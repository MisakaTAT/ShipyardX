import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEngineEvents } from '@/shared/api/events/use-engine-events'
import { qk } from '@/shared/api/query-keys'

export function useDockerEventInvalidation(serverId: string, enabled: boolean) {
  const qc = useQueryClient()

  const { events, status, clearEvents } = useEngineEvents({
    serverId,
    enabled,
    onRefresh: (resource) => {
      // 任何资源变化都刷一下引擎概览
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

  // 切换或禁用服务器时，清掉对应缓存，避免闪现旧数据
  useEffect(() => {
    if (!enabled) return
    return () => {
      qc.removeQueries({ queryKey: ['docker', serverId], exact: false })
    }
  }, [qc, serverId, enabled])

  return { events, status, clearEvents }
}
