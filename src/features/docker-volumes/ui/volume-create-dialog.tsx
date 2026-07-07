import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  volumeCreateDefaultValues,
  volumeCreateFormSchema,
  type VolumeCreateFormValues,
} from '@/features/docker-volumes/model/volume-create-schema'
import { Database, Loader2, Plus } from 'lucide-react'
import { FormFieldRow } from '@/shared/components/form-field'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { useCreateVolume } from '@/features/docker-volumes/api/use-volumes'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { toast } from '@/shared/components/toast'

export interface VolumeCreateDialogProps {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void | Promise<void>
}

export default function VolumeCreateDialog({ serverId, open, onOpenChange, onCreated }: VolumeCreateDialogProps) {
  const formId = useId()
  const createVolume = useCreateVolume(serverId)

  const form = useForm<VolumeCreateFormValues>({
    resolver: zodResolver(volumeCreateFormSchema),
    defaultValues: volumeCreateDefaultValues(),
    mode: 'onSubmit',
  })

  const enableNfs = form.watch('enableNfs')

  useEffect(() => {
    if (!open) return
    form.reset(volumeCreateDefaultValues())
  }, [open, form])

  const onSubmit = createToastFormSubmit(form, async (values) => {
    const driverOpts: Record<string, string> = {}

    if (values.enableNfs) {
      const addr = values.nfsAddr.trim()
      const mount = values.nfsMount.trim()
      const oParts: string[] = []
      oParts.push(`addr=${addr}`)
      const ver = values.nfsVersion.trim()
      if (ver) oParts.push(`nfsvers=${ver}`)
      const opt = values.nfsOptions.trim()
      if (opt) {
        for (const p of opt
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean))
          oParts.push(p)
      }

      driverOpts.type = 'nfs'
      driverOpts.o = oParts.join(',')
      driverOpts.device = `:${mount}`
    }

    createVolume.mutate(
      {
        name: values.name.trim(),
        driver: 'local',
        driverOpts: Object.keys(driverOpts).length ? driverOpts : null,
      },
      {
        onSuccess: () => {
          toast.success('存储卷已创建')
          onOpenChange(false)
          void onCreated?.()
        },
      }
    )
  })

  const submitting = createVolume.isPending

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return
        onOpenChange(next)
      }}
      title="创建存储卷"
      icon={Database}
      disableClose={submitting}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form={`${formId}-vol-create`} disabled={submitting}>
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
      <form id={`${formId}-vol-create`} onSubmit={onSubmit} className="contents">
        <FieldGroup className="gap-4">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <FormFieldRow label="名称" htmlFor={`${formId}-name`} required invalid={fieldState.invalid}>
                <Input
                  id={`${formId}-name`}
                  {...field}
                  placeholder="my-volume"
                  disabled={submitting}
                  aria-invalid={fieldState.invalid}
                />
              </FormFieldRow>
            )}
          />
          <Controller
            control={form.control}
            name="driver"
            render={({ field }) => (
              <FormFieldRow label="模式" required>
                <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择 Driver" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="local">local</SelectItem>
                  </SelectContent>
                </Select>
              </FormFieldRow>
            )}
          />

          <Controller
            control={form.control}
            name="enableNfs"
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldLabel className="flex cursor-pointer items-center gap-2 font-normal text-foreground">
                  <Checkbox
                    checked={field.value}
                    disabled={submitting}
                    onCheckedChange={(c) => field.onChange(c === true)}
                  />
                  启用 NFS 存储
                </FieldLabel>
              </Field>
            )}
          />

          {enableNfs ? (
            <>
              <Controller
                control={form.control}
                name="nfsAddr"
                render={({ field, fieldState }) => (
                  <FormFieldRow label="地址" htmlFor={`${formId}-nfs-addr`} required invalid={fieldState.invalid}>
                    <Input
                      id={`${formId}-nfs-addr`}
                      {...field}
                      placeholder="10.0.0.10 或 nfs.example.com"
                      disabled={submitting}
                      aria-invalid={fieldState.invalid}
                    />
                  </FormFieldRow>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  control={form.control}
                  name="nfsVersion"
                  render={({ field, fieldState }) => (
                    <FormFieldRow label="版本" htmlFor={`${formId}-nfs-ver`} invalid={fieldState.invalid}>
                      <Input
                        id={`${formId}-nfs-ver`}
                        {...field}
                        placeholder="4.1"
                        disabled={submitting}
                        aria-invalid={fieldState.invalid}
                      />
                    </FormFieldRow>
                  )}
                />
                <Controller
                  control={form.control}
                  name="nfsMount"
                  render={({ field, fieldState }) => (
                    <FormFieldRow label="挂载点" htmlFor={`${formId}-nfs-mount`} required invalid={fieldState.invalid}>
                      <Input
                        id={`${formId}-nfs-mount`}
                        {...field}
                        placeholder="/nfs-share"
                        disabled={submitting}
                        aria-invalid={fieldState.invalid}
                      />
                    </FormFieldRow>
                  )}
                />
              </div>
              <Controller
                control={form.control}
                name="nfsOptions"
                render={({ field, fieldState }) => (
                  <FormFieldRow label="可选参数" htmlFor={`${formId}-nfs-opt`} invalid={fieldState.invalid}>
                    <Input
                      id={`${formId}-nfs-opt`}
                      {...field}
                      placeholder="rw,noatime,rsize=8192,wsize=8192,tcp,timeo=14"
                      disabled={submitting}
                      aria-invalid={fieldState.invalid}
                    />
                  </FormFieldRow>
                )}
              />
            </>
          ) : null}
        </FieldGroup>
      </form>
    </StandardDialog>
  )
}
