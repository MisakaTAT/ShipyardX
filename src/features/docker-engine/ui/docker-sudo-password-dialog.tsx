import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  dockerSudoPasswordDefaultValues,
  dockerSudoPasswordFormSchema,
  type DockerSudoPasswordFormValues,
} from '@/features/docker-engine/model/daemon-schema'
import { KeyRound, Loader2, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true)
          return
        }
        if (busy) return
        onOpenChange(false)
      }}
    >
      <DialogContent className="max-w-md p-0" showCloseButton={false}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex shrink-0 text-primary [&_svg]:size-4">
            <KeyRound />
          </span>
          <DialogTitle className="flex-1 text-sm leading-none font-semibold text-foreground">
            请输入提权密码
          </DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" onClick={requestClose} disabled={busy}>
            <X className="size-4" />
          </Button>
        </div>

        <form id={`${formId}-sudo`} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                      />
                      <FieldError errors={[fieldState.error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </FieldGroup>
          </div>
        </form>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" form={`${formId}-sudo`} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
