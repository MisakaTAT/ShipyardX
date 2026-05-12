import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/shared/api/query-keys'
import { commands, type AppListItem, type InstallApp } from '@/types/app-bindings'

export function useAppStoreSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: commands.syncAppstore,
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: qk.apps() })
      toast.success(msg)
    },
    onError: (err) => toast.error(String(err)),
  })
}

export function useApps() {
  return useQuery({
    queryKey: qk.apps(),
    queryFn: commands.listApps,
    placeholderData: [] as AppListItem[],
  })
}

export function useAppDetail(appKey: string | null) {
  return useQuery({
    queryKey: qk.appDetail(appKey),
    queryFn: () => commands.getAppDetail(appKey!),
    enabled: !!appKey,
  })
}

export function useInstallApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { serverId: string; req: InstallApp }) => commands.installApp(params.serverId, params.req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.apps() })
    },
  })
}
