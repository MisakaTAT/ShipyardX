import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands, type NetworkCreate } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toastAppError } from '@/shared/lib/errors'

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
