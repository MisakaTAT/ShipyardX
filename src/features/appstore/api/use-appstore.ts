import { useEffect, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
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
import i18n from '@/app/i18n'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export function useAppStoreSync() {
  return useInvalidatingMutation({
    mutationFn: commands.syncAppstore,
    invalidate: [['appstore']],
    onSuccess: () => {
      toast.success(i18n.t('ui.appstore.syncDone'))
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

export function useApps(sourceId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.apps(sourceId),
    queryFn: () => commands.listApps(sourceId),
    enabled,
    placeholderData: [] as AppListItem[],
  })
}

/**
 * 并行读取所有启用源的目录。查询键和 useApps 一致，和应用商店页共享缓存，
 * 切到某个源时不会重复请求。
 */
export function useAllApps(sources: { id: string; name: string }[], enabled = true) {
  const results = useQueries({
    queries: sources.map((source) => ({
      queryKey: qk.apps(source.id),
      queryFn: () => commands.listApps(source.id),
      enabled,
      placeholderData: [] as AppListItem[],
    })),
  })

  return sources.map((source, index) => ({
    sourceId: source.id,
    sourceName: source.name,
    apps: results[index]?.data ?? [],
  }))
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
