import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands, type RunContainer } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'

export function useContainers(serverId: string) {
  return useQuery({
    queryKey: qk.containers(serverId),
    queryFn: () => commands.listContainers(serverId),
  })
}

export type ContainerAction = 'start' | 'stop' | 'restart' | 'remove'

interface ContainerActionVars {
  containerId: string
  action: ContainerAction
  force?: boolean
}

export function useContainerAction(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.containers(serverId) }),
    onError: (err) => toastAppError(err),
  })
}

export function useRunContainer(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: RunContainer) => commands.runContainer(serverId, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.containers(serverId) }),
  })
}

export function usePruneStoppedContainers(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => commands.pruneStoppedContainers(serverId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.containers(serverId) })
      toast.success('已清理已停止容器', {
        description: `清理项 ${result.deleted_count} 个，回收 ${result.reclaimed}`,
      })
    },
    onError: (err) => toastAppError(err),
  })
}
