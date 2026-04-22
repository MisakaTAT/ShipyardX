import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { commands } from '@/types/app-bindings'
import {
  networkCreateDefaultValues,
  networkCreateFormSchema,
  type NetworkCreateFormValues,
} from '@/features/docker-networks/model/network-create-schema'
import type { NetworkCreate } from '@/types/app-bindings'
import { Share2, Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { modalDialogContent } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'

export interface NetworkCreateDialogProps {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void | Promise<void>
}

export default function NetworkCreateDialog({ serverId, open, onOpenChange, onCreated }: NetworkCreateDialogProps) {
  const formId = useId()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<NetworkCreateFormValues>({
    resolver: zodResolver(networkCreateFormSchema),
    defaultValues: networkCreateDefaultValues(),
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!open) return
    form.reset(networkCreateDefaultValues())
  }, [open, form])

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      const req: NetworkCreate = {
        name: values.name.trim(),
        driver: values.driver.trim() || null,
        subnet: values.subnet.trim() || null,
        gateway: values.gateway.trim() || null,
        internal: values.internal,
        attachable: values.attachable,
      }
      await commands.createNetwork(serverId, req)
      onOpenChange(false)
      await onCreated()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onOpenChange(false)
      }}
    >
      <DialogContent className={cn(modalDialogContent)} showCloseButton={false}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex shrink-0 text-primary [&_svg]:size-4">
            <Share2 />
          </span>
          <DialogTitle className="flex-1 text-sm leading-none font-semibold text-foreground">创建网络</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            <X className="size-4" />
          </Button>
        </div>

        <form id={`${formId}-net-create`} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                      <FieldError errors={[fieldState.error]} />
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
                      <FieldError errors={[fieldState.error]} />
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
                        <FieldError errors={[fieldState.error]} />
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
                        <FieldError errors={[fieldState.error]} />
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
          </div>
        </form>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
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
      </DialogContent>
    </Dialog>
  )
}
