import { useQuery } from '@tanstack/react-query'
import i18n from '@/app/i18n'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

export function useImages(serverId: string, enabled = true) {
  return useQuery({
    queryKey: qk.images(serverId),
    queryFn: () => commands.listImages(serverId),
    enabled: enabled && Boolean(serverId),
  })
}

export function useImageHistory(serverId: string, imageId: string, enabled = true) {
  return useQuery({
    queryKey: qk.imageHistory(serverId, imageId),
    queryFn: () => commands.getImageHistory(serverId, imageId),
    enabled: enabled && Boolean(serverId) && Boolean(imageId),
  })
}

interface RemoveImageVars {
  imageId: string
  force: boolean
}

interface ExportImageVars {
  exportId: string
  imageId: string
  directory: string
  fileName: string
}

interface ImportImageVars {
  importId: string
  filePath: string
}

function notifyCleanupSuccess(
  title: string,
  result: {
    deleted_count: number
    reclaimed: string
  }
) {
  toast.success(title, {
    description: i18n.t('ui.images.pruned', { count: String(result.deleted_count), size: result.reclaimed }),
  })
}

export function useRemoveImage(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: ({ imageId, force }: RemoveImageVars) => commands.removeImage(serverId, imageId, force),
    invalidate: [qk.images(serverId)],
  })
}

export function useExportImage(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: ({ exportId, imageId, directory, fileName }: ExportImageVars) =>
      commands.exportImage(exportId, serverId, imageId, directory, fileName),
    onError: (err) => toastAppError(err),
  })
}

export function useImportImage(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: ({ importId, filePath }: ImportImageVars) => commands.importImage(importId, serverId, filePath),
    invalidate: [qk.images(serverId)],
  })
}

export function usePruneDanglingImages(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: () => commands.pruneDanglingImages(serverId),
    invalidate: [qk.images(serverId)],
    onSuccess: (result) => {
      notifyCleanupSuccess(i18n.t('ui.images.prunedDangling'), result)
    },
  })
}

export function usePruneUnusedImages(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: () => commands.pruneUnusedImages(serverId),
    invalidate: [qk.images(serverId)],
    onSuccess: (result) => {
      notifyCleanupSuccess(i18n.t('ui.images.prunedUnused'), result)
    },
  })
}

export function usePruneBuilderCache(serverId: string) {
  return useInvalidatingMutation({
    mutationFn: () => commands.pruneBuilderCache(serverId),
    invalidate: [qk.images(serverId)],
    onSuccess: (result) => {
      notifyCleanupSuccess(i18n.t('ui.images.prunedCache'), result)
    },
  })
}
