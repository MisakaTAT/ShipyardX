import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commands, type ServerConfig } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'

const EMPTY_SERVERS: ServerConfig[] = []

export function useServers() {
  return useQuery({
    queryKey: qk.servers(),
    queryFn: () => commands.getServers(),
    placeholderData: EMPTY_SERVERS,
  })
}

export function useDeleteServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => commands.deleteServer(id),
    onSuccess: (updated) => {
      qc.setQueryData(qk.servers(), updated)
    },
    onError: (err) => toast.error(String(err)),
  })
}

/**
 * 把 ServerDialog 保存完后的最新列表灌回 query cache。
 */
export function useSetServers() {
  const qc = useQueryClient()
  return (servers: ServerConfig[]) => {
    qc.setQueryData(qk.servers(), servers)
  }
}
