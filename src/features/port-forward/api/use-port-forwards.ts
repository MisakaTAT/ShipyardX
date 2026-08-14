import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { commands } from '@/types/app-bindings'
import i18n from '@/app/i18n'
import { qk } from '@/shared/api/query-keys'
import { toast } from '@/shared/components/toast'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export function usePortForwards(enabled = true) {
  return useQuery({
    queryKey: qk.portForwards(),
    queryFn: () => commands.listPortForwardsAll(),
    enabled,
    refetchOnMount: true,
    placeholderData: [],
  })
}

export function localizeAddressName(name: string) {
  return name === 'port_forward.all_interfaces' ? i18n.t('backend.port_forward.all_interfaces') : name
}

export function useLocalAddresses(enabled = true) {
  return useQuery({
    queryKey: qk.localAddresses(),
    queryFn: async () =>
      (await commands.listLocalAddresses()).map((address) => ({
        ...address,
        name: localizeAddressName(address.name),
      })),
    enabled,
    placeholderData: [
      { ip: '0.0.0.0', name: i18n.t('backend.port_forward.all_interfaces') },
      { ip: '127.0.0.1', name: '127.0.0.1 (localhost)' },
    ],
  })
}

export function useCreatePortForwardRule() {
  return useInvalidatingMutation({
    mutationFn: (args: Parameters<typeof commands.createPortForwardRule>) => commands.createPortForwardRule(...args),
    invalidate: [qk.portForwards()],
    onSuccess: (created) => {
      toast.success(i18n.t('ui.portForward.created', { port: String(created.local_port) }))
    },
  })
}

const POLL_INTERVAL_MS = 3000

export function usePortForwardPolling(enabled: boolean) {
  const qc = useQueryClient()
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    const refresh = () => {
      if (!enabledRef.current || document.hidden) return
      void qc.invalidateQueries({ queryKey: qk.portForwards() })
    }

    const timer = window.setInterval(refresh, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [qc])
}

export function useSetPortForwardEnabled() {
  return useInvalidatingMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => commands.setPortForwardEnabled(id, enabled),
    invalidate: [qk.portForwards()],
    onSuccess: (_r, { enabled }) => {
      toast.success(i18n.t(enabled ? 'ui.portForward.enabled' : 'ui.portForward.disabled'))
    },
  })
}

export function useRetryPortForward() {
  return useInvalidatingMutation({
    mutationFn: (id: string) => commands.startPortForward(id),
    invalidate: [qk.portForwards()],
    onSuccess: () => {
      toast.success(i18n.t('ui.portForward.retried'))
    },
  })
}

export function useSetPortForwardsEnabled() {
  return useInvalidatingMutation({
    mutationFn: ({ ids, enabled }: { ids: string[]; enabled: boolean }) =>
      commands.setPortForwardsEnabled(ids, enabled),
    invalidate: [qk.portForwards()],
    onSuccess: (_r, { ids, enabled }) => {
      toast.success(
        i18n.t(enabled ? 'ui.portForward.enabledMany' : 'ui.portForward.disabledMany', { count: ids.length })
      )
    },
  })
}

export function useDeletePortForward() {
  return useInvalidatingMutation({
    mutationFn: (id: string) => commands.deletePortForward(id),
    invalidate: [qk.portForwards()],
    onSuccess: () => {
      toast.success(i18n.t('ui.portForward.deleted'))
    },
  })
}

export function useStartAllPortForwards() {
  return useInvalidatingMutation({
    mutationFn: () => commands.startAllEnabledGlobal(),
    invalidate: [qk.portForwards()],
    onSuccess: () => {
      toast.success(i18n.t('ui.portForward.startedAll'))
    },
  })
}

export function useStopAllPortForwards() {
  return useInvalidatingMutation({
    mutationFn: () => commands.stopAllGlobal(),
    invalidate: [qk.portForwards()],
    onSuccess: () => {
      toast.success(i18n.t('ui.portForward.stoppedAll'))
    },
  })
}
