import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/shared/api/query-keys'
import { commands, events, type AppListItem, type AppstoreSyncProgress, type InstallApp } from '@/types/app-bindings'
import { toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'

export function useAppStoreSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: commands.syncAppstore,
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: qk.apps() })
      toast.success(msg)
    },
    onError: (err) => toastAppError(err),
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
            percent: event.payload.total_objects > 0 ? Math.min(event.payload.percent, 12) : 0,
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
