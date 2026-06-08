import { useCallback, useEffect, useRef, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { getErrorCode, toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'

export type DockerStatus = 'checking' | 'ok' | 'no_permission' | 'no_docker' | 'error'

export function useDockerAccess(serverId: string) {
  const [status, setStatus] = useState<DockerStatus>('checking')
  const ran = useRef(false)

  const check = useCallback(
    async (notify = false) => {
      setStatus('checking')
      try {
        await commands.checkDockerAccess(serverId)
        setStatus('ok')
        if (notify) toast.success('Docker 连接正常')
      } catch (e) {
        const code = getErrorCode(e)
        if (code === 'docker.permission_denied') {
          setStatus('no_permission')
          if (notify) toastAppError(e, '权限不足，请将用户加入 docker 组')
        } else if (code === 'docker.unavailable') {
          setStatus('no_docker')
          if (notify) toastAppError(e, 'Docker 未安装或未运行')
        } else {
          setStatus('error')
          if (notify) toastAppError(e, '无法连接 Docker')
        }
      }
    },
    [serverId]
  )

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void check()
  }, [check])

  return { status, recheck: check, ok: status === 'ok' }
}
