import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import i18n from '@/app/i18n'
import { commands } from '@/types/app-bindings'
import { getErrorCode, toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'
import { qk } from '@/shared/api/query-keys'

export type ServerConnectionStatus = 'checking' | 'ok' | 'error'

export function useServerConnection(serverId: string) {
  const query = useQuery({
    queryKey: qk.serverConnection(serverId),
    queryFn: () => commands.testServerConnection(serverId),
    retry: false,
  })

  const check = useCallback(
    async (notify = false) => {
      const result = await query.refetch()
      if (!result.error) {
        if (notify) toast.success(i18n.t('ui.servers.connectionOk'))
        return
      }
      if (notify) {
        const code = getErrorCode(result.error)
        toastAppError(
          result.error,
          code.startsWith('ssh.') ? i18n.t('ui.servers.unreachable') : i18n.t('ui.servers.checkFailed')
        )
      }
    },
    [query]
  )

  const status: ServerConnectionStatus = query.isLoading ? 'checking' : query.error ? 'error' : 'ok'

  return { status, recheck: check, ok: status === 'ok', error: query.error }
}
