import { useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Fingerprint, Loader2 } from 'lucide-react'
import { FormFieldHint, FormFieldRow } from '@/shared/components/form-field'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { FieldGroup } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { useTrustHostKey } from '@/features/host-keys/api/use-host-keys'
import {
  hostKeyAddDefaultValues,
  hostKeyAddFormSchema,
  type HostKeyAddFormValues,
} from '@/features/host-keys/model/host-key-add-schema'

interface HostKeyAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function HostKeyAddDialog({ open, onOpenChange }: HostKeyAddDialogProps) {
  const { t } = useTranslation()
  const formId = useId()
  const trust = useTrustHostKey()

  const form = useForm<HostKeyAddFormValues>({
    resolver: zodResolver(hostKeyAddFormSchema),
    defaultValues: hostKeyAddDefaultValues(),
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!open) return
    form.reset(hostKeyAddDefaultValues())
  }, [form, open])

  const onSubmit = createToastFormSubmit(
    form,
    (values) => {
      trust.mutate(
        { host: values.host, port: values.port, fingerprint: values.fingerprint },
        { onSuccess: () => onOpenChange(false) }
      )
    },
    t('ui.hostKeys.addFailed')
  )

  const submitting = trust.isPending

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return
        onOpenChange(next)
      }}
      title={t('ui.hostKeys.addTitle')}
      icon={Fingerprint}
      disableClose={submitting}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            {t('ui.common.cancel')}
          </Button>
          <Button type="submit" form={`${formId}-host-key-add`} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {t('ui.common.add')}
          </Button>
        </div>
      }
    >
      <form id={`${formId}-host-key-add`} onSubmit={onSubmit} className="contents">
        <FieldGroup className="gap-4">
          <Controller
            control={form.control}
            name="host"
            render={({ field, fieldState }) => (
              <FormFieldRow
                label={t('ui.hostKeys.hostLabel')}
                htmlFor={`${formId}-host`}
                required
                invalid={fieldState.invalid}
              >
                <Input
                  id={`${formId}-host`}
                  placeholder={t('ui.hostKeys.hostPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={submitting}
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
              </FormFieldRow>
            )}
          />

          <Controller
            control={form.control}
            name="port"
            render={({ field, fieldState }) => (
              <FormFieldRow
                label={t('ui.hostKeys.portLabel')}
                htmlFor={`${formId}-port`}
                required
                invalid={fieldState.invalid}
              >
                <Input
                  id={`${formId}-port`}
                  type="number"
                  min={1}
                  max={65535}
                  disabled={submitting}
                  aria-invalid={fieldState.invalid}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    field.onChange(Number.isFinite(n) ? n : 0)
                  }}
                />
              </FormFieldRow>
            )}
          />

          <Controller
            control={form.control}
            name="fingerprint"
            render={({ field, fieldState }) => (
              <FormFieldRow
                label={t('ui.hostKeys.fingerprintLabel')}
                htmlFor={`${formId}-fingerprint`}
                required
                invalid={fieldState.invalid}
                description={<FormFieldHint>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</FormFieldHint>}
              >
                <Input
                  id={`${formId}-fingerprint`}
                  className="font-mono"
                  placeholder="SHA256:"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={submitting}
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
              </FormFieldRow>
            )}
          />
        </FieldGroup>
      </form>
    </StandardDialog>
  )
}
