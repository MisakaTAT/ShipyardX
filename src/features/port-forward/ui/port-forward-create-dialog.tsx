import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  portForwardCreateDefaultValues,
  portForwardCreateFormSchema,
  type PortForwardCreateFormValues,
} from '@/features/port-forward/model/port-forward-create-schema'
import { parseContainerTcpPortOptions } from '@/features/port-forward/lib/parse-container-tcp-ports'
import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { useCreatePortForwardRule, useLocalAddresses } from '@/features/port-forward/api/use-port-forwards'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { toast } from '@/shared/components/toast'
import { useServers } from '@/features/servers/api/use-servers'
import { useContainers } from '@/features/docker-containers/api/use-containers'

interface PortForwardCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void | Promise<void>
}

export default function PortForwardCreateDialog({ open, onOpenChange, onCreated }: PortForwardCreateDialogProps) {
  const formId = useId()
  const createRule = useCreatePortForwardRule()

  const form = useForm<PortForwardCreateFormValues>({
    resolver: zodResolver(portForwardCreateFormSchema),
    defaultValues: portForwardCreateDefaultValues(),
    mode: 'onSubmit',
  })

  const watchServerId = form.watch('serverId')
  const watchContainerId = form.watch('containerId')
  const { data: servers = [], isLoading: serversLoading } = useServers()
  const { data: localAddresses = [] } = useLocalAddresses(open)
  const { data: containers = [], isLoading: containersLoading } = useContainers(watchServerId, open)

  const selectedContainer = useMemo(
    () => containers.find((c) => c.id === watchContainerId) ?? null,
    [containers, watchContainerId]
  )
  const portOptions = useMemo(() => parseContainerTcpPortOptions(selectedContainer?.ports ?? ''), [selectedContainer])

  useEffect(() => {
    if (!open) return
    form.reset(portForwardCreateDefaultValues())
  }, [form, open])

  useEffect(() => {
    if (!open || serversLoading) return
    if (servers.length === 0) {
      form.setValue('serverId', '')
      return
    }
    const cur = form.getValues('serverId')
    if (!cur || !servers.some((s) => s.id === cur)) {
      form.setValue('serverId', servers[0].id)
    }
  }, [form, open, servers, serversLoading])

  useEffect(() => {
    if (!open || containersLoading) return
    if (containers.length === 0) {
      form.setValue('containerId', '')
      return
    }
    const cur = form.getValues('containerId')
    if (!cur || !containers.some((c) => c.id === cur)) {
      form.setValue('containerId', containers[0].id)
    }
  }, [containers, containersLoading, form, open])

  useEffect(() => {
    if (!open) return
    form.setValue('containerPort', 0)
  }, [open, watchContainerId, form])

  useEffect(() => {
    if (!open || localAddresses.length === 0) return
    const cur = form.getValues('bindAddress')
    if (!localAddresses.some((a) => a.ip === cur)) {
      const fallback = localAddresses.find((a) => a.ip === '127.0.0.1')?.ip ?? localAddresses[0].ip
      form.setValue('bindAddress', fallback)
    }
  }, [form, localAddresses, open])

  const onSubmit = createToastFormSubmit(form, async (values) => {
    const container = containers.find((c) => c.id === values.containerId)
    if (!container) {
      toast.error('请选择容器')
      return
    }
    if (portOptions.length === 0) {
      form.setError('containerPort', { type: 'custom', message: '该容器没有可用 TCP 端口' })
      return
    }

    createRule.mutate(
      [
        values.serverId,
        {
          container_id: container.id,
          container_name: container.name || null,
          remote_host: container.ip,
          remote_port: values.containerPort,
          container_port: values.containerPort,
          protocol: 'tcp',
          local_port: values.localPort,
          bind_address: values.bindAddress.trim() || null,
          enabled: true,
        },
      ],
      {
        onSuccess: () => {
          onOpenChange(false)
          void onCreated?.()
        },
      }
    )
  }, '请检查端口转发配置后重试')

  const submitting = createRule.isPending

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return
        onOpenChange(next)
      }}
      title="创建转发规则"
      icon={ArrowLeftRight}
      disableClose={submitting}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form={`${formId}-pf-create`} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            创建
          </Button>
        </div>
      }
    >
      <form id={`${formId}-pf-create`} onSubmit={onSubmit} className="contents">
        <FieldGroup className="gap-4">
          <Controller
            control={form.control}
            name="serverId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>主机</FieldLabel>
                <FieldContent>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting || serversLoading || servers.length === 0}
                  >
                    <SelectTrigger className="w-full" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="选择主机">
                        {(value) => (value ? (servers.find((s) => s.id === value)?.name ?? value) : '选择主机')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {servers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="containerId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>容器</FieldLabel>
                <FieldContent>
                  {containersLoading ? (
                    <div className="flex h-9 items-center justify-center">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={submitting || containers.length === 0}
                    >
                      <SelectTrigger className="w-full" aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="选择容器">
                          {(value) => (value ? (containers.find((c) => c.id === value)?.name ?? value) : '选择容器')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start">
                        {containers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="containerPort"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>容器端口</FieldLabel>
                <FieldContent>
                  {portOptions.length === 0 ? (
                    <FieldDescription>该容器没有可用 TCP 端口</FieldDescription>
                  ) : (
                    <Select
                      value={
                        field.value >= 1 && portOptions.some((p) => p.container_port === field.value)
                          ? String(field.value)
                          : undefined
                      }
                      onValueChange={(v) => field.onChange(Number(v))}
                      disabled={submitting}
                    >
                      <SelectTrigger className="w-full" aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="选择容器端口" />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {portOptions.map((p) => (
                          <SelectItem key={p.container_port} value={String(p.container_port)}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="bindAddress"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>绑定地址</FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                    <SelectTrigger className="w-full" aria-invalid={fieldState.invalid}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      {localAddresses.map((o) => (
                        <SelectItem key={o.ip} value={o.ip}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="localPort"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-local-port`}>本地端口</FieldLabel>
                <FieldContent>
                  <Input
                    id={`${formId}-local-port`}
                    type="number"
                    min={0}
                    max={65535}
                    disabled={submitting}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      field.onChange(Number.isFinite(n) ? n : 0)
                    }}
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>填 0 时由系统随机分配本地端口</FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </StandardDialog>
  )
}
