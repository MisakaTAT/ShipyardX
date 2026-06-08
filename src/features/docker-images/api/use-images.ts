import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toastAppError } from '@/shared/lib/errors'

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
  totalBytes: number | null
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
    mutationFn: ({ exportId, imageId, directory, fileName, totalBytes }: ExportImageVars) =>
      commands.exportImage(exportId, serverId, imageId, directory, fileName, totalBytes),
    onError: (err) => toastAppError(err),
  })
}
