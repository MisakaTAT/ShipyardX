import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  volumeCreateDefaultValues,
  volumeCreateFormSchema,
  type VolumeCreateFormValues,
} from '@/features/docker-volumes/model/volume-create-schema'
import { Database, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { useCreateVolume } from '@/features/docker-volumes/api/use-volumes'
import { StandardDialog } from '@/shared/components/standard-dialog'

export interface VolumeCreateDialogProps {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void | Promise<void>
}

export default function VolumeCreateDialog({ serverId, open, onOpenChange, onCreated }: VolumeCreateDialogProps) {
  const formId = useId()
  const [submitting, setSubmitting] = useState(false)
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

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
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
        onSettled: () => {
          setSubmitting(false)
        },
      }
    )
  })

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
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-name`}>名称</FieldLabel>
                <FieldContent>
                  <Input
                    id={`${formId}-name`}
                    {...field}
                    placeholder="my-volume"
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
            render={({ field }) => (
              <Field>
                <FieldLabel>模式</FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择 Driver" />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="local">local</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
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
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-nfs-addr`}>地址</FieldLabel>
                    <FieldContent>
                      <Input
                        id={`${formId}-nfs-addr`}
                        {...field}
                        placeholder="10.0.0.10 或 nfs.example.com"
                        disabled={submitting}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldError errors={[fieldState.error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  control={form.control}
                  name="nfsVersion"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${formId}-nfs-ver`}>版本</FieldLabel>
                      <FieldContent>
                        <Input
                          id={`${formId}-nfs-ver`}
                          {...field}
                          placeholder="4.1"
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
                  name="nfsMount"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${formId}-nfs-mount`}>挂载点</FieldLabel>
                      <FieldContent>
                        <Input
                          id={`${formId}-nfs-mount`}
                          {...field}
                          placeholder="/nfs-share"
                          disabled={submitting}
                          aria-invalid={fieldState.invalid}
                        />
                        <FieldError errors={[fieldState.error]} />
                      </FieldContent>
                    </Field>
                  )}
                />
              </div>
              <Controller
                control={form.control}
                name="nfsOptions"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-nfs-opt`}>可选参数</FieldLabel>
                    <FieldContent>
                      <Input
                        id={`${formId}-nfs-opt`}
                        {...field}
                        placeholder="rw,noatime,rsize=8192,wsize=8192,tcp,timeo=14"
                        disabled={submitting}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldError errors={[fieldState.error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </>
          ) : null}
        </FieldGroup>
      </form>
    </StandardDialog>
  )
}
