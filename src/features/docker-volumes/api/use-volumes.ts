import { useQuery } from '@tanstack/react-query'
import i18n from '@/app/i18n'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toast } from '@/shared/components/toast'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export function useVolumes(serverId: string) {
  return useQuery({
    queryKey: qk.volumes(serverId),
    queryFn: () => commands.listVolumes(serverId),
  })
}

export function useRemoveVolume(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: (name: string) => commands.removeVolume(serverId, name),
    invalidate: [qk.volumes(serverId)],
  })
}

interface CreateVolumeVars {
  name: string
  driver: string | null
  driverOpts: Record<string, string> | null
}

export function useCreateVolume(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: (vars: CreateVolumeVars) => commands.createVolume(serverId, vars.name, vars.driver, vars.driverOpts),
    invalidate: [qk.volumes(serverId)],
  })
}

export function usePruneUnusedVolumes(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: () => commands.pruneUnusedVolumes(serverId),
    invalidate: [qk.volumes(serverId)],
    onSuccess: (result) => {
      toast.success(i18n.t('ui.volumes.pruned'), {
        description: i18n.t('ui.volumes.prunedDesc', { count: String(result.deleted_count), size: result.reclaimed }),
      })
    },
  })
}
