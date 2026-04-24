import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  dockerSudoPasswordDefaultValues,
  dockerSudoPasswordFormSchema,
  type DockerSudoPasswordFormValues,
} from '@/features/docker-engine/model/daemon-schema'
import { KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { StandardDialog } from '@/shared/components/standard-dialog'

export interface DockerSudoPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  onSubmitPassword: (password: string) => void | Promise<void>
}

export default function DockerSudoPasswordDialog({
  open,
  onOpenChange,
  busy,
  onSubmitPassword,
}: DockerSudoPasswordDialogProps) {
  const formId = useId()
  const form = useForm<DockerSudoPasswordFormValues>({
    resolver: zodResolver(dockerSudoPasswordFormSchema),
    defaultValues: dockerSudoPasswordDefaultValues(),
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!open) return
    form.reset(dockerSudoPasswordDefaultValues())
  }, [open, form])

  const onSubmit = form.handleSubmit(async ({ password }) => {
    await onSubmitPassword(password)
  })

  const requestClose = () => {
    if (busy) return
    onOpenChange(false)
  }

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return
        onOpenChange(next)
      }}
      title="请输入提权密码"
      icon={KeyRound}
      disableClose={busy}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" form={`${formId}-sudo`} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            确认
          </Button>
        </div>
      }
    >
      <form id={`${formId}-sudo`} onSubmit={onSubmit} className="contents">
        <FieldGroup className="gap-3">
          <FieldDescription>当前操作需要 sudo 权限 请输入服务器用户的提权密码</FieldDescription>
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldContent>
                  <Input
                    id={`${formId}-pwd`}
                    type="password"
                    {...field}
                    placeholder="sudo 密码"
                    disabled={busy}
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </StandardDialog>
  )
}
