import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { commands } from '@/types/app-bindings'
import {
  networkCreateDefaultValues,
  networkCreateFormSchema,
  type NetworkCreateFormValues,
} from '@/schema/networkCreateFormSchema'
import type { NetworkCreate } from '@/types/app-bindings'
import { Share2, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeaderBar } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  }, [open])

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
      <DialogContent variant="panel">
        <DialogHeaderBar
          icon={<Share2 />}
          title="创建网络"
          onClose={() => onOpenChange(false)}
          closeDisabled={submitting}
        />

        <form id={`${formId}-net-create`} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogBody className="min-h-0 flex-1 overflow-y-auto">
            <FieldGroup className="gap-4">
              <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-name`} required>
                      名称
                    </FieldLabel>
                    <FieldContent>
                      <Input id={`${formId}-name`} {...field} placeholder="my-net" disabled={submitting} />
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
                    <FieldLabel required>Driver</FieldLabel>
                    <FieldContent>
                      <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                        <SelectTrigger className="font-mono">
                          <SelectValue placeholder="选择 Driver" />
                        </SelectTrigger>
                        <SelectContent position="popper" align="start">
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
                          className="font-mono"
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
                          className="font-mono"
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
                    <FieldLabel className="flex cursor-pointer items-center gap-2 font-normal text-(--text-base)">
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
                    <FieldLabel className="flex cursor-pointer items-center gap-2 font-normal text-(--text-base)">
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
          </DialogBody>
        </form>

        <DialogFooter variant="actionsEnd">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
