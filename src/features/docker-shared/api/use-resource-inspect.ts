import { useQuery } from '@tanstack/react-query'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'

export type InspectKind = 'container' | 'image' | 'network' | 'volume'

export function useResourceInspect(serverId: string, kind: InspectKind, targetId: string, enabled = true) {
  return useQuery({
    queryKey:
      kind === 'container'
        ? qk.containerInspect(serverId, targetId)
        : kind === 'image'
          ? qk.imageInspect(serverId, targetId)
          : kind === 'network'
            ? qk.networkInspect(serverId, targetId)
            : qk.volumeInspect(serverId, targetId),
    queryFn: () => {
      switch (kind) {
        case 'container':
          return commands.inspectContainer(serverId, targetId)
        case 'image':
          return commands.inspectImage(serverId, targetId)
        case 'network':
          return commands.inspectNetwork(serverId, targetId)
        case 'volume':
          return commands.inspectVolume(serverId, targetId)
      }
    },
    enabled: enabled && Boolean(serverId) && Boolean(targetId),
  })
}
