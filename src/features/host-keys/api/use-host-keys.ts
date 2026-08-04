import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
      toast.success(`已删除 ${host}:${port} 的指纹`, { description: '下次连接该主机时会重新要求确认' })
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
      toast.success(`已清理 ${count} 条指纹`)
    },
  })
}

export function useClearKnownHosts() {
  return useInvalidatingMutation({
    mutationFn: () => commands.clearKnownHosts(),
    invalidate: [qk.knownHosts()],
    onSuccess: (count) => {
      toast.success(`已清空 ${count} 条指纹`, { description: '所有主机下次连接时都会重新要求确认' })
    },
  })
}

export function useTrustHostKey() {
  return useInvalidatingMutation({
    mutationFn: ({ host, port, fingerprint }: { host: string; port: number; fingerprint: string }) =>
      commands.trustHostKey(host, port, fingerprint),
    invalidate: [qk.knownHosts()],
    onSuccess: (_r, { host, port }) => {
      toast.success(`已信任 ${host}:${port} 的指纹`)
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
        update(id, { status: 'failed', message: getErrorMessage(error, '检测失败') })
      }
    },
    [update]
  )

  const clear = useCallback((id: string) => update(id, null), [update])

  return { results, probe, clear }
}
