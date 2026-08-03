import { useQuery } from '@tanstack/react-query'
import { commands, type NetworkCreate } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toast } from '@/shared/components/toast'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export function useNetworks(serverId: string, enabled = true) {
  return useQuery({
    queryKey: qk.networks(serverId),
    queryFn: () => commands.listNetworks(serverId),
    enabled: enabled && Boolean(serverId),
  })
}

export function useRemoveNetwork(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: (networkId: string) => commands.removeNetwork(serverId, networkId),
    invalidate: [qk.networks(serverId)],
  })
}

export function useCreateNetwork(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: (params: NetworkCreate) => commands.createNetwork(serverId, params),
    invalidate: [qk.networks(serverId)],
  })
}

export function usePruneUnusedNetworks(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: () => commands.pruneUnusedNetworks(serverId),
    invalidate: [qk.networks(serverId)],
    onSuccess: (result) => {
      toast.success('已清理未使用网络', {
        description: `清理项 ${result.deleted_count} 个`,
      })
    },
  })
}
