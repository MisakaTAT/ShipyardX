import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands, type ServerConfig } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toastAppError } from '@/shared/lib/errors'
import { useInvalidatingMutation } from '@/shared/api/use-invalidating-mutation'

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
  return useInvalidatingMutation({
    mutationFn: (id: string) => commands.deleteServer(id),
    onSuccess: (updated) => {
      qc.setQueryData(qk.servers(), updated)
    },
  })
}

export function useSaveServer() {
  const qc = useQueryClient()
  return useInvalidatingMutation({
    mutationFn: (server: ServerConfig) => (server.id ? commands.updateServer(server) : commands.addServer(server)),
    onSuccess: (updated) => {
      qc.setQueryData(qk.servers(), updated)
    },
  })
}

export function useTestServerConnection() {
  return useMutation({
    mutationFn: (server: ServerConfig) => commands.testServerConnectionDirect(server),
    onError: (err) => toastAppError(err, '连接测试失败'),
  })
}
