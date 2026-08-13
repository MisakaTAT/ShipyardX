import { useQuery } from '@tanstack/react-query'
import i18n from '@/app/i18n'
import { commands, type RunContainer } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toast } from '@/shared/components/toast'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export function useContainers(serverId: string, enabled = true) {
  return useQuery({
    queryKey: qk.containers(serverId),
    queryFn: () => commands.listContainers(serverId),
    enabled: enabled && Boolean(serverId),
    placeholderData: [],
  })
}

export function useContainerStats(serverId: string, containerId: string, enabled = true) {
  return useQuery({
    queryKey: qk.containerStats(serverId, containerId),
    queryFn: () => commands.getContainerStats(serverId, containerId),
    enabled: enabled && Boolean(serverId) && Boolean(containerId),
    refetchInterval: 5000,
  })
}

export type ContainerAction = 'start' | 'stop' | 'restart' | 'remove'

interface ContainerActionVars {
  containerId: string
  action: ContainerAction
  force?: boolean
}

export function useContainerAction(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: async ({ containerId, action, force }: ContainerActionVars) => {
      switch (action) {
        case 'start':
          return commands.startContainer(serverId, containerId)
        case 'stop':
          return commands.stopContainer(serverId, containerId)
        case 'restart':
          return commands.restartContainer(serverId, containerId)
        case 'remove':
          return commands.removeContainer(serverId, containerId, Boolean(force))
      }
    },
    invalidate: [qk.containers(serverId)],
  })
}

export function useRunContainer(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: (params: RunContainer) => commands.runContainer(serverId, params),
    invalidate: [qk.containers(serverId)],
  })
}

export function usePruneStoppedContainers(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: () => commands.pruneStoppedContainers(serverId),
    invalidate: [qk.containers(serverId)],
    onSuccess: (result) => {
      toast.success(i18n.t('ui.containers.pruned'), {
        description: i18n.t('ui.containers.prunedDesc', {
          count: String(result.deleted_count),
          size: result.reclaimed,
        }),
      })
    },
  })
}
