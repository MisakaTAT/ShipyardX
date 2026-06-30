import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/shared/api/query-keys'
import {
  commands,
  events,
  type AppListItem,
  type AppstoreCacheInfo,
  type AppstoreSettings,
  type AppstoreSyncProgress,
  type InstallApp,
} from '@/types/app-bindings'
import { toast } from '@/shared/components/toast'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export function useAppStoreSync() {
  return useInvalidatingMutation({
    mutationFn: commands.syncAppstore,
    invalidate: [['appstore']],
    onSuccess: (msg) => {
      toast.success(msg)
    },
  })
}

export function useAppStoreSyncIndicator(active: boolean) {
  const [progress, setProgress] = useState<AppstoreSyncProgress | null>(null)

  useEffect(() => {
    if (!active) {
      setProgress(null)
      return
    }

    const unlistenPromise = events.appstoreSyncProgress.listen((event) => {
      setProgress((current) => {
        if (!current) {
          return {
            ...event.payload,
            percent: event.payload.total_objects > 0 ? Math.min(event.payload.percent ?? 0, 12) : 0,
          }
        }
        return event.payload
      })
    })

    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [active])

  return progress
}

export function useApps(sourceId: string | null) {
  return useQuery({
    queryKey: qk.apps(sourceId),
    queryFn: () => commands.listApps(sourceId),
    placeholderData: [] as AppListItem[],
  })
}

export function useAppDetail(sourceId: string | null, appKey: string | null) {
  return useQuery({
    queryKey: qk.appDetail(sourceId, appKey),
    queryFn: () => commands.getAppDetail(sourceId, appKey!),
    enabled: !!sourceId && !!appKey,
  })
}

export function useInstallApp() {
  return useInvalidatingMutation({
    mutationFn: (params: { serverId: string; req: InstallApp }) => commands.installApp(params.serverId, params.req),
    invalidate: [['appstore']],
  })
}

export function useAppStoreSettings(initialData?: AppstoreSettings) {
  return useQuery({
    queryKey: qk.appstoreSettings(),
    queryFn: commands.getAppstoreSettings,
    ...(initialData ? { initialData } : {}),
  })
}

export function useUpdateAppStoreSettings() {
  const qc = useQueryClient()
  return useInvalidatingMutation({
    mutationFn: (settings: AppstoreSettings) => commands.updateAppstoreSettings(settings),
    invalidate: [['appstore']],
    onSuccess: (saved) => {
      qc.setQueryData(qk.appstoreSettings(), saved)
    },
  })
}

export function useAppStoreCacheInfo(initialData?: AppstoreCacheInfo) {
  return useQuery({
    queryKey: qk.appstoreCacheInfo(),
    queryFn: commands.getAppstoreCacheInfo,
    ...(initialData ? { initialData } : {}),
  })
}

export function useClearAppStoreCache() {
  return useInvalidatingMutation({
    mutationFn: commands.clearAppstoreCache,
    invalidate: [qk.appstoreCacheInfo(), ['appstore']],
  })
}
