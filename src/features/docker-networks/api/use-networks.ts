import { useQuery } from '@tanstack/react-query'
import i18n from '@/app/i18n'
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
      toast.success(i18n.t('ui.networks.pruned'), {
        description: i18n.t('ui.networks.prunedDesc', { count: String(result.deleted_count) }),
      })
    },
  })
}
