import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commands } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'

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

export function useRemoveImage(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ imageId, force }: RemoveImageVars) => commands.removeImage(serverId, imageId, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.images(serverId) }),
    onError: (err) => toast.error(String(err)),
  })
}
