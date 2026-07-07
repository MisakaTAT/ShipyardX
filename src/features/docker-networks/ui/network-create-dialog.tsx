import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  networkCreateDefaultValues,
  networkCreateFormSchema,
  type NetworkCreateFormValues,
} from '@/features/docker-networks/model/network-create-schema'
import type { NetworkCreate } from '@/types/app-bindings'
import { Share2, Loader2, Plus } from 'lucide-react'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { useCreateNetwork } from '@/features/docker-networks/api/use-networks'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { toast } from '@/shared/components/toast'

export interface NetworkCreateDialogProps {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void | Promise<void>
}

export default function NetworkCreateDialog({ serverId, open, onOpenChange, onCreated }: NetworkCreateDialogProps) {
  const formId = useId()
  const createNetwork = useCreateNetwork(serverId)

  const form = useForm<NetworkCreateFormValues>({
    resolver: zodResolver(networkCreateFormSchema),
    defaultValues: networkCreateDefaultValues(),
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!open) return
    form.reset(networkCreateDefaultValues())
  }, [open, form])

  const onSubmit = createToastFormSubmit(form, async (values) => {
    const req: NetworkCreate = {
      name: values.name.trim(),
      driver: values.driver.trim() || null,
      subnet: values.subnet.trim() || null,
      gateway: values.gateway.trim() || null,
      internal: values.internal,
      attachable: values.attachable,
    }
    createNetwork.mutate(req, {
      onSuccess: () => {
        toast.success('网络已创建')
        onOpenChange(false)
        void onCreated?.()
      },
    })
  })

  const submitting = createNetwork.isPending

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return
        onOpenChange(next)
      }}
      title="创建网络"
      icon={Share2}
      disableClose={submitting}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form={`${formId}-net-create`} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                创建中
              </>
            ) : (
              <>
                <Plus />
                创建
              </>
            )}
          </Button>
        </div>
      }
    >
      <form id={`${formId}-net-create`} onSubmit={onSubmit} className="contents">
        <FieldGroup className="gap-4">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-name`}>名称</FieldLabel>
                <FieldContent>
                  <Input
                    id={`${formId}-name`}
                    {...field}
                    placeholder="my-net"
                    disabled={submitting}
                    aria-invalid={fieldState.invalid}
                  />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="driver"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Driver</FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                    <SelectTrigger className="w-full" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="选择 Driver" />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="bridge">bridge</SelectItem>
                      <SelectItem value="host">host</SelectItem>
                      <SelectItem value="overlay">overlay</SelectItem>
                      <SelectItem value="macvlan">macvlan</SelectItem>
                      <SelectItem value="ipvlan">ipvlan</SelectItem>
                      <SelectItem value="none">none</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <Controller
              control={form.control}
              name="subnet"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${formId}-subnet`}>子网（可选）</FieldLabel>
                  <FieldContent>
                    <Input
                      id={`${formId}-subnet`}
                      {...field}
                      placeholder="172.28.0.0/16"
                      disabled={submitting}
                      aria-invalid={fieldState.invalid}
                    />
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="gateway"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${formId}-gw`}>网关（可选）</FieldLabel>
                  <FieldContent>
                    <Input
                      id={`${formId}-gw`}
                      {...field}
                      placeholder="172.28.0.1"
                      disabled={submitting}
                      aria-invalid={fieldState.invalid}
                    />
                  </FieldContent>
                </Field>
              )}
            />
          </div>
          <FieldDescription>不填子网时由 Docker 自动分配地址池</FieldDescription>
          <Controller
            control={form.control}
            name="internal"
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldLabel className="flex cursor-pointer items-center gap-2 font-normal text-foreground">
                  <Checkbox
                    checked={field.value}
                    disabled={submitting}
                    onCheckedChange={(c) => field.onChange(c === true)}
                  />
                  Internal（禁止对外路由）
                </FieldLabel>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="attachable"
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldLabel className="flex cursor-pointer items-center gap-2 font-normal text-foreground">
                  <Checkbox
                    checked={field.value}
                    disabled={submitting}
                    onCheckedChange={(c) => field.onChange(c === true)}
                  />
                  Attachable（允许其它引擎附加容器）
                </FieldLabel>
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </StandardDialog>
  )
}
