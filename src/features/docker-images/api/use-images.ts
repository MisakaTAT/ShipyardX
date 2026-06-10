import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'

export function useImages(serverId: string) {
  return useQuery({
    queryKey: qk.images(serverId),
    queryFn: () => commands.listImages(serverId),
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
    description: `清理项 ${result.deleted_count} 个，回收 ${result.reclaimed}`,
  })
}

export function useRemoveImage(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ imageId, force }: RemoveImageVars) => commands.removeImage(serverId, imageId, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.images(serverId) }),
    onError: (err) => toastAppError(err),
  })
}

export function useExportImage(serverId: string) {
  return useMutation({
    mutationFn: ({ exportId, imageId, directory, fileName }: ExportImageVars) =>
      commands.exportImage(exportId, serverId, imageId, directory, fileName),
    onError: (err) => toastAppError(err),
  })
}

export function useImportImage(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ importId, filePath }: ImportImageVars) => commands.importImage(importId, serverId, filePath),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.images(serverId) }),
    onError: (err) => toastAppError(err),
  })
}

export function usePruneDanglingImages(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => commands.pruneDanglingImages(serverId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.images(serverId) })
      notifyCleanupSuccess('已清理悬空镜像', result)
    },
    onError: (err) => toastAppError(err),
  })
}

export function usePruneUnusedImages(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => commands.pruneUnusedImages(serverId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.images(serverId) })
      notifyCleanupSuccess('已清理未使用镜像', result)
    },
    onError: (err) => toastAppError(err),
  })
}

export function usePruneBuilderCache(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => commands.pruneBuilderCache(serverId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.images(serverId) })
      notifyCleanupSuccess('已清理构建缓存', result)
    },
    onError: (err) => toastAppError(err),
  })
}
