import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import i18n from '@/app/i18n'
import { commands, type KnownHostEntry } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toast } from '@/shared/components/toast'
import { getErrorMessage } from '@/shared/lib/errors'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'
import { hostKeyId, type ProbeState } from '@/features/host-keys/model/host-key'

export function useKnownHosts(enabled = true) {
  return useQuery({
    queryKey: qk.knownHosts(),
    queryFn: () => commands.listKnownHosts(),
    enabled,
    refetchOnMount: true,
    placeholderData: [],
  })
}

export function useForgetHostKey() {
  return useInvalidatingMutation({
    mutationFn: ({ host, port }: { host: string; port: number }) => commands.forgetHostKey(host, port),
    invalidate: [qk.knownHosts()],
    onSuccess: (_removed, { host, port }) => {
      toast.success(i18n.t('ui.hostKeys.deleted', { host, port: String(port) }), {
        description: i18n.t('ui.hostKeys.deletedDesc'),
      })
    },
  })
}

export function useForgetHostKeys() {
  return useInvalidatingMutation({
    mutationFn: async (targets: { host: string; port: number }[]) => {
      for (const { host, port } of targets) await commands.forgetHostKey(host, port)
      return targets.length
    },
    invalidate: [qk.knownHosts()],
    onSuccess: (count) => {
      toast.success(i18n.t('ui.hostKeys.cleaned', { count: String(count) }))
    },
  })
}

export function useClearKnownHosts() {
  return useInvalidatingMutation({
    mutationFn: () => commands.clearKnownHosts(),
    invalidate: [qk.knownHosts()],
    onSuccess: (count) => {
      toast.success(i18n.t('ui.hostKeys.cleared', { count: String(count) }), {
        description: i18n.t('ui.hostKeys.clearedDesc'),
      })
    },
  })
}

export function useTrustHostKey() {
  return useInvalidatingMutation({
    mutationFn: ({ host, port, fingerprint }: { host: string; port: number; fingerprint: string }) =>
      commands.trustHostKey(host, port, fingerprint),
    invalidate: [qk.knownHosts()],
    onSuccess: (_r, { host, port }) => {
      toast.success(i18n.t('ui.hostKeys.trusted', { host, port: String(port) }))
    },
  })
}

/**
 * 逐条比对线上指纹。结果只留在内存里，刷新页面即清空 —— 它反映的是某一刻的探测结果，
 * 持久化会让人误以为是当前状态。
 */
export function useHostKeyProbe() {
  const [results, setResults] = useState<Record<string, ProbeState>>({})

  const update = useCallback((id: string, state: ProbeState | null) => {
    setResults((prev) => {
      const next = { ...prev }
      if (state) next[id] = state
      else delete next[id]
      return next
    })
  }, [])

  const probe = useCallback(
    async (entry: KnownHostEntry) => {
      const id = hostKeyId(entry.host, entry.port)
      update(id, { status: 'probing' })
      try {
        const fingerprint = await commands.probeHostKey(entry.host, entry.port)
        update(id, fingerprint === entry.fingerprint ? { status: 'match' } : { status: 'mismatch', fingerprint })
      } catch (error) {
        update(id, { status: 'failed', message: getErrorMessage(error, i18n.t('ui.hostKeys.checkFailed')) })
      }
    },
    [update]
  )

  const clear = useCallback((id: string) => update(id, null), [update])

  return { results, probe, clear }
}
