import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'

export function usePortForwards() {
  return useQuery({
    queryKey: qk.portForwards(),
    queryFn: () => commands.listPortForwardsAll(),
    refetchOnMount: true,
    placeholderData: [],
  })
}

export function useCreatePortForwardRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: Parameters<typeof commands.createPortForwardRule>) => commands.createPortForwardRule(...args),
    onSuccess: (created) => {
      toast.success(`已创建转发规则（本地端口：${created.local_port}）`)
      qc.invalidateQueries({ queryKey: qk.portForwards() })
    },
    onError: (err) => toast.error(String(err)),
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
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => commands.setPortForwardEnabled(id, enabled),
    onSuccess: (_r, { enabled }) => {
      toast.success(enabled ? '规则已启用' : '规则已禁用')
      qc.invalidateQueries({ queryKey: qk.portForwards() })
    },
    onError: (err) => toast.error(String(err)),
  })
}

export function useDeletePortForward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => commands.deletePortForward(id),
    onSuccess: () => {
      toast.success('已删除规则')
      qc.invalidateQueries({ queryKey: qk.portForwards() })
    },
    onError: (err) => toast.error(String(err)),
  })
}

export function useStartAllPortForwards() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => commands.startAllEnabledGlobal(),
    onSuccess: () => {
      toast.success('已启动所有已启用规则')
      qc.invalidateQueries({ queryKey: qk.portForwards() })
    },
    onError: (err) => toast.error(String(err)),
  })
}

export function useStopAllPortForwards() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => commands.stopAllGlobal(),
    onSuccess: () => {
      toast.success('已停止所有转发')
      qc.invalidateQueries({ queryKey: qk.portForwards() })
    },
    onError: (err) => toast.error(String(err)),
  })
}
