import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  dockerSudoPasswordDefaultValues,
  dockerSudoPasswordFormSchema,
  type DockerSudoPasswordFormValues,
} from '@/schema/dockerDaemonFormSchema'
import { KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeaderBar } from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

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
  }, [open])

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
      <DialogContent variant="panelMd">
        <DialogHeaderBar icon={<KeyRound />} title="请输入提权密码" onClose={requestClose} closeDisabled={busy} />

        <form id={`${formId}-sudo`} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogBody className="min-h-0 flex-1 overflow-y-auto">
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
          </DialogBody>
        </form>

        <DialogFooter variant="actionsEnd">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" form={`${formId}-sudo`} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
