import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { commands } from '@/types/app-bindings'
import {
  daemonSettingsToFormValues,
  dockerDaemonDefaultValues,
  dockerDaemonFormSchema,
  formValuesToDaemonUpdate,
  type DockerDaemonFormValues,
} from '@/features/docker-engine/model/daemon-schema'
import {
  useDockerDaemonSettings,
  useRestartDockerDaemon,
  useUpdateDockerDaemonSettings,
} from '@/features/docker-engine/api/use-docker-access'
import DockerSudoPasswordDialog from '@/features/docker-engine/ui/docker-sudo-password-dialog'
import { Loader2, RotateCcw, Save, Undo2 } from 'lucide-react'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Textarea } from '@/shared/ui/textarea'
import { isPermissionRelatedError, resolveAppError, toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'

interface Props {
  serverId: string
}

export default function DockerManagePanel({ serverId }: Props) {
  const { t } = useTranslation()
  const daemonFormId = useId()
  const [authOpen, setAuthOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'save' | 'restart' | null>(null)
  const daemonSettingsQuery = useDockerDaemonSettings(serverId)
  const updateDaemonSettings = useUpdateDockerDaemonSettings(serverId)
  const restartDaemon = useRestartDockerDaemon(serverId)

  const daemonForm = useForm<DockerDaemonFormValues>({
    resolver: zodResolver(dockerDaemonFormSchema),
    defaultValues: dockerDaemonDefaultValues(),
    mode: 'onSubmit',
  })

  const cgroupDriver = daemonForm.watch('cgroup_driver')
  const logRotation = daemonForm.watch('log_rotation')

  useEffect(() => {
    if (!daemonSettingsQuery.data) return
    daemonForm.reset(daemonSettingsToFormValues(daemonSettingsQuery.data))
  }, [daemonForm, daemonSettingsQuery.data])

  useEffect(() => {
    if (!daemonSettingsQuery.error) return
    toastAppError(daemonSettingsQuery.error)
  }, [daemonSettingsQuery.error])

  const reload = useCallback(async () => {
    const result = await daemonSettingsQuery.refetch()
    if (result.error) {
      toastAppError(result.error)
    }
  }, [daemonSettingsQuery])

  const persistUpdate = async (values: DockerDaemonFormValues, password?: string) => {
    const params = formValuesToDaemonUpdate(values, password ?? null)
    try {
      await updateDaemonSettings.mutateAsync(params)
      toast.success(t('ui.daemon.saved'))
      setAuthOpen(false)
      setPendingAction(null)
      await reload()
    } catch (e) {
      if (!password && isPermissionRelatedError(e)) {
        setPendingAction('save')
        setAuthOpen(true)
        return
      }
      toastAppError(e)
    }
  }

  const runRestart = async (password?: string) => {
    try {
      await restartDaemon.mutateAsync(password ?? null)

      let lastError: ReturnType<typeof resolveAppError> | null = null
      let recovered = false
      for (let i = 0; i < 20; i += 1) {
        try {
          await commands.checkDockerAccess(serverId)
          recovered = true
          break
        } catch (e) {
          lastError = resolveAppError(e)
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      if (!recovered) {
        throw (
          lastError ?? {
            code: 'docker.restart_recovery_timeout',
            kind: 'timeout' as const,
            message: t('ui.daemon.restartPending'),
            detail: null,
            retryable: true,
            action: t('ui.daemon.restartPendingAction'),
          }
        )
      }

      toast.success(t('ui.daemon.restarted'))
      setAuthOpen(false)
      setPendingAction(null)
      await reload()
    } catch (e) {
      if (!password && isPermissionRelatedError(e)) {
        setPendingAction('restart')
        setAuthOpen(true)
        return
      }
      toastAppError(e)
    }
  }

  const onDaemonSubmit = createToastFormSubmit(daemonForm, async (values) => {
    await persistUpdate(values, undefined)
  })

  const loading = daemonSettingsQuery.isLoading
  const saving = updateDaemonSettings.isPending
  const restarting = restartDaemon.isPending
  const busy = loading || saving || restarting

  return (
    <>
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form id={`${daemonFormId}-daemon`} onSubmit={onDaemonSubmit} className="contents">
          <div className="h-full overflow-auto">
            <FieldGroup className="gap-3">
              <SettingsCard>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{t('ui.daemon.mirrors')}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{t('ui.daemon.mirrorsHint')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      title={t('ui.daemon.restart')}
                      aria-label={t('ui.daemon.restart')}
                      onClick={() => void runRestart()}
                      disabled={busy}
                    >
                      {restarting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      title={t('ui.daemon.revert')}
                      aria-label={t('ui.daemon.revert')}
                      onClick={() => daemonForm.reset()}
                      disabled={busy}
                    >
                      <Undo2 />
                    </Button>
                    <Button
                      type="submit"
                      form={`${daemonFormId}-daemon`}
                      size="icon-sm"
                      title={t('ui.common.save')}
                      aria-label={t('ui.common.save')}
                      disabled={busy || !daemonForm.formState.isDirty}
                    >
                      {saving ? <Loader2 className="animate-spin" /> : <Save />}
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <Controller
                    control={daemonForm.control}
                    name="mirrorText"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldContent>
                          <Textarea
                            {...field}
                            placeholder={'https://docker.1panel.live\nhttps://mirror.example.com'}
                            className="h-24 resize-none"
                            disabled={busy}
                            aria-invalid={fieldState.invalid}
                          />
                        </FieldContent>
                      </Field>
                    )}
                  />
                </div>
              </SettingsCard>

              <div className="grid grid-cols-2 gap-4">
                <SettingsCard>
                  <Controller
                    control={daemonForm.control}
                    name="live_restore"
                    render={({ field }) => (
                      <Field>
                        <FieldLabel className="text-sm font-medium text-foreground">Live restore</FieldLabel>
                        <FieldDescription>{t('ui.daemon.liveRestoreHint')}</FieldDescription>
                        <FieldContent className="mt-3">
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                            <Checkbox
                              checked={field.value}
                              disabled={busy}
                              onCheckedChange={(c) => field.onChange(c === true)}
                            />
                            {field.value ? t('ui.common.enabled') : t('ui.common.disabled')}
                          </label>
                        </FieldContent>
                      </Field>
                    )}
                  />
                </SettingsCard>

                <SettingsCard>
                  <Controller
                    control={daemonForm.control}
                    name="cgroup_driver"
                    render={({ field }) => (
                      <Field>
                        <FieldLabel className="text-sm font-medium text-foreground">cgroup driver</FieldLabel>
                        <FieldDescription>
                          {t('ui.daemon.cgroupCurrent', { driver: cgroupDriver || t('ui.common.default') })}
                        </FieldDescription>
                        <FieldContent className="mt-3">
                          <RadioGroup
                            value={field.value === '' ? 'default' : field.value}
                            onValueChange={(v) => field.onChange(v === 'default' ? '' : v)}
                            disabled={busy}
                            className="flex flex-row flex-wrap items-center gap-x-5 gap-y-2"
                          >
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                              <RadioGroupItem value="default" id={`${daemonFormId}-cgroup-default`} />
                              {t('ui.common.default')}
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                              <RadioGroupItem value="systemd" id={`${daemonFormId}-cgroup-systemd`} />
                              systemd
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                              <RadioGroupItem value="cgroupfs" id={`${daemonFormId}-cgroup-cgroupfs`} />
                              cgroupfs
                            </label>
                          </RadioGroup>
                        </FieldContent>
                      </Field>
                    )}
                  />
                </SettingsCard>
              </div>

              <SettingsCard>
                <Controller
                  control={daemonForm.control}
                  name="socket_path"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel className="text-sm font-medium text-foreground">
                        {t('ui.daemon.socketPath')}
                      </FieldLabel>
                      <FieldDescription>{t('ui.daemon.socketHint')}</FieldDescription>
                      <FieldContent className="mt-3">
                        <Input
                          {...field}
                          placeholder="unix:///var/run/docker.sock"
                          disabled={busy}
                          aria-invalid={fieldState.invalid}
                        />
                      </FieldContent>
                    </Field>
                  )}
                />
              </SettingsCard>

              <SettingsCard>
                <Controller
                  control={daemonForm.control}
                  name="log_rotation"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel className="text-sm font-medium text-foreground">
                        {t('ui.daemon.logRotation')}
                      </FieldLabel>
                      <FieldContent className="mt-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={field.value}
                            disabled={busy}
                            onCheckedChange={(c) => field.onChange(c === true)}
                          />
                          {t('ui.daemon.enableLogRotation')}
                        </label>
                        {logRotation ? (
                          <div className="mt-2 grid grid-cols-2 gap-3">
                            <Controller
                              control={daemonForm.control}
                              name="log_max_size"
                              render={({ field: f, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                  <FieldContent>
                                    <Input {...f} placeholder="10m" disabled={busy} aria-invalid={fieldState.invalid} />
                                  </FieldContent>
                                </Field>
                              )}
                            />
                            <Controller
                              control={daemonForm.control}
                              name="log_max_file"
                              render={({ field: f, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                  <FieldContent>
                                    <Input {...f} placeholder="3" disabled={busy} aria-invalid={fieldState.invalid} />
                                  </FieldContent>
                                </Field>
                              )}
                            />
                          </div>
                        ) : null}
                      </FieldContent>
                    </Field>
                  )}
                />
              </SettingsCard>
            </FieldGroup>
          </div>
        </form>
      )}

      <DockerSudoPasswordDialog
        open={authOpen}
        busy={saving || restarting}
        onOpenChange={(open) => {
          setAuthOpen(open)
          if (!open) setPendingAction(null)
        }}
        onSubmitPassword={async (password) => {
          if (pendingAction === 'save') await persistUpdate(daemonForm.getValues(), password)
          else if (pendingAction === 'restart') await runRestart(password)
        }}
      />
    </>
  )
}

function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-4">{children}</div>
}
