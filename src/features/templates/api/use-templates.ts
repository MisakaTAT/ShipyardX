import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands, type AppTemplateInput, type DeployTemplate } from '@/types/app-bindings'
import { qk } from '@/shared/api/query-keys'
import { toast } from '@/shared/components/toast'
import { toastAppError } from '@/shared/lib/errors'

export function useTemplates() {
  return useQuery({
    queryKey: qk.templates(),
    queryFn: commands.listTemplates,
    placeholderData: [],
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AppTemplateInput) => commands.createTemplate(input),
    onSuccess: () => {
      toast.success('模板已保存')
      qc.invalidateQueries({ queryKey: qk.templates() })
    },
    onError: (err) => toastAppError(err),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ templateId, input }: { templateId: string; input: AppTemplateInput }) =>
      commands.updateTemplate(templateId, input),
    onSuccess: () => {
      toast.success('模板已更新')
      qc.invalidateQueries({ queryKey: qk.templates() })
    },
    onError: (err) => toastAppError(err),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => commands.deleteTemplate(templateId),
    onSuccess: () => {
      toast.success('模板已删除')
      qc.invalidateQueries({ queryKey: qk.templates() })
    },
    onError: (err) => toastAppError(err),
  })
}

export function useExtractTemplateFields() {
  return useMutation({
    mutationFn: (compose: string) => commands.extractTemplateFields(compose),
    onError: (err) => toastAppError(err),
  })
}

export function useDeployTemplate() {
  return useMutation({
    mutationFn: (params: { serverId: string; req: DeployTemplate }) => commands.deployTemplate(params.serverId, params.req),
    onError: (err) => toastAppError(err),
  })
}
