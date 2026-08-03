import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/types/app-bindings'
import { getErrorCode, toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'
import { qk } from '@/shared/api/query-keys'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export type DockerStatus = 'checking' | 'ok' | 'no_permission' | 'no_docker' | 'error'

export function useDockerAccess(serverId: string, enabled = true) {
  const query = useQuery({
    queryKey: qk.dockerAccess(serverId),
    queryFn: () => commands.checkDockerAccess(serverId),
    retry: false,
    enabled,
  })

  const check = useCallback(
    async (notify = false) => {
      const result = await query.refetch()
      if (!result.error) {
        if (notify) toast.success('Docker 连接正常')
        return
      }
      const e = result.error
      const code = getErrorCode(e)
      if (notify) {
        if (code === 'docker.permission_denied') {
          toastAppError(e, '权限不足，请将用户加入 docker 组')
        } else if (code === 'docker.unavailable') {
          toastAppError(e, 'Docker 未安装或未运行')
        } else {
          toastAppError(e, '无法连接 Docker')
        }
      }
    },
    [query]
  )

  const status: DockerStatus = query.isLoading
    ? 'checking'
    : query.error
      ? getErrorCode(query.error) === 'docker.permission_denied'
        ? 'no_permission'
        : getErrorCode(query.error) === 'docker.unavailable'
          ? 'no_docker'
          : 'error'
      : 'ok'

  return { status, recheck: check, ok: status === 'ok', info: query.data, error: query.error }
}

export function useDockerDaemonSettings(serverId: string, enabled = true) {
  return useQuery({
    queryKey: qk.dockerDaemon(serverId),
    queryFn: () => commands.getDockerDaemonSettings(serverId),
    enabled,
  })
}

export function useUpdateDockerDaemonSettings(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: (params: Parameters<typeof commands.updateDockerDaemonSettings>[1]) =>
      commands.updateDockerDaemonSettings(serverId, params),
    invalidate: [qk.dockerDaemon(serverId), qk.dockerInfo(serverId)],
  })
}

export function useRestartDockerDaemon(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: (password: string | null) => commands.restartDockerDaemon(serverId, password),
    invalidate: [qk.dockerAccess(serverId), qk.dockerInfo(serverId), qk.dockerDaemon(serverId)],
  })
}
