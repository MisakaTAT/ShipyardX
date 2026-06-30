import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toast } from '@/shared/components/toast'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export function usePortForwards() {
  return useQuery({
    queryKey: qk.portForwards(),
    queryFn: () => commands.listPortForwardsAll(),
    refetchOnMount: true,
    placeholderData: [],
  })
}

export function useLocalAddresses(enabled = true) {
  return useQuery({
    queryKey: qk.localAddresses(),
    queryFn: () => commands.listLocalAddresses(),
    enabled,
    placeholderData: [
      { ip: '0.0.0.0', name: '所有网卡 (0.0.0.0)' },
      { ip: '127.0.0.1', name: '127.0.0.1 (localhost)' },
    ],
  })
}

export function useCreatePortForwardRule() {
  return useInvalidatingMutation({
    mutationFn: (args: Parameters<typeof commands.createPortForwardRule>) => commands.createPortForwardRule(...args),
    invalidate: [qk.portForwards()],
    onSuccess: (created) => {
      toast.success(`已创建转发规则（本地端口：${created.local_port}）`)
    },
  })
}

/** 启用时每 3 秒轮询一次端口转发列表，页面不可见时暂停 */
export function usePortForwardPolling(enabled: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined
    const start = () => {
      if (timer == null && !document.hidden) {
        qc.invalidateQueries({ queryKey: qk.portForwards() })
        timer = window.setInterval(() => {
          qc.invalidateQueries({ queryKey: qk.portForwards() })
        }, 3000)
      }
    }
    const stop = () => {
      if (timer != null) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    start()
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [qc, enabled])
}

export function useSetPortForwardEnabled() {
  return useInvalidatingMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => commands.setPortForwardEnabled(id, enabled),
    invalidate: [qk.portForwards()],
    onSuccess: (_r, { enabled }) => {
      toast.success(enabled ? '规则已启用' : '规则已禁用')
    },
  })
}

export function useDeletePortForward() {
  return useInvalidatingMutation({
    mutationFn: (id: string) => commands.deletePortForward(id),
    invalidate: [qk.portForwards()],
    onSuccess: () => {
      toast.success('已删除规则')
    },
  })
}

export function useStartAllPortForwards() {
  return useInvalidatingMutation({
    mutationFn: () => commands.startAllEnabledGlobal(),
    invalidate: [qk.portForwards()],
    onSuccess: () => {
      toast.success('已启动所有已启用规则')
    },
  })
}

export function useStopAllPortForwards() {
  return useInvalidatingMutation({
    mutationFn: () => commands.stopAllGlobal(),
    invalidate: [qk.portForwards()],
    onSuccess: () => {
      toast.success('已停止所有转发')
    },
  })
}
