import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'

export function useVolumes(serverId: string) {
  return useQuery({
    queryKey: qk.volumes(serverId),
    queryFn: () => commands.listVolumes(serverId),
  })
}

export function useRemoveVolume(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => commands.removeVolume(serverId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.volumes(serverId) }),
    onError: (err) => toastAppError(err),
  })
}

interface CreateVolumeVars {
  name: string
  driver: string | null
  driverOpts: Record<string, string> | null
}

export function useCreateVolume(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: CreateVolumeVars) => commands.createVolume(serverId, vars.name, vars.driver, vars.driverOpts),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.volumes(serverId) }),
    onError: (err) => toastAppError(err),
  })
}

export function usePruneUnusedVolumes(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => commands.pruneUnusedVolumes(serverId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.volumes(serverId) })
      toast.success('已清理未使用存储卷', {
        description: `清理项 ${result.deleted_count} 个，回收 ${result.reclaimed}`,
      })
    },
    onError: (err) => toastAppError(err),
  })
}
