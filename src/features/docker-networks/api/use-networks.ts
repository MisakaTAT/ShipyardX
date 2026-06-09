import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands, type NetworkCreate } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'

export function useNetworks(serverId: string) {
  return useQuery({
    queryKey: qk.networks(serverId),
    queryFn: () => commands.listNetworks(serverId),
  })
}

export function useRemoveNetwork(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (networkId: string) => commands.removeNetwork(serverId, networkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.networks(serverId) }),
    onError: (err) => toastAppError(err),
  })
}

export function useCreateNetwork(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: NetworkCreate) => commands.createNetwork(serverId, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.networks(serverId) }),
    onError: (err) => toastAppError(err),
  })
}

export function usePruneUnusedNetworks(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => commands.pruneUnusedNetworks(serverId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.networks(serverId) })
      toast.success('已清理未使用网络', {
        description: `清理项 ${result.deleted_count} 个`,
      })
    },
    onError: (err) => toastAppError(err),
  })
}
