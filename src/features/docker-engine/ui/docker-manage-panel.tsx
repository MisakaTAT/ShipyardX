import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Textarea } from '@/shared/ui/textarea'
import { isPermissionRelatedError, normalizeAppError, toastAppError } from '@/shared/lib/errors'
import { toast } from '@/shared/components/toast'

interface Props {
  serverId: string
}

export default function DockerManagePanel({ serverId }: Props) {
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
      toast.success('Docker 配置已保存，需手动重启后生效。')
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

      let lastError: ReturnType<typeof normalizeAppError> | null = null
      let recovered = false
      for (let i = 0; i < 20; i += 1) {
        try {
          await commands.checkDockerAccess(serverId)
          recovered = true
          break
        } catch (e) {
          lastError = normalizeAppError(e, 'Docker 尚未恢复连接')
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      if (!recovered) {
        throw (
          lastError ?? {
            code: 'docker.restart_recovery_timeout',
            kind: 'timeout' as const,
            message: '重启命令已执行，但 Docker 尚未恢复连接，请稍后重试',
            detail: null,
            retryable: true,
            action: '稍后重试，或检查 Docker 服务状态',
          }
        )
      }

      toast.success('重启完成')
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

  const onDaemonSubmit = daemonForm.handleSubmit(async (values) => {
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
                    <div className="text-sm font-medium text-foreground">镜像加速</div>
                    <div className="mt-1 text-xs text-muted-foreground">多个地址换行填写（为空则取消镜像加速）</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      title="重启 Docker"
                      aria-label="重启 Docker"
                      onClick={() => void runRestart()}
                      disabled={busy}
                    >
                      {restarting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      title="撤销未保存修改"
                      aria-label="撤销未保存修改"
                      onClick={() => daemonForm.reset()}
                      disabled={busy}
                    >
                      <Undo2 />
                    </Button>
                    <Button
                      type="submit"
                      form={`${daemonFormId}-daemon`}
                      size="icon-sm"
                      title="保存"
                      aria-label="保存"
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
                          <FieldError errors={[fieldState.error]} />
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
                        <FieldDescription>允许在 Docker 守护进程异常停机时保留正在运行的容器状态</FieldDescription>
                        <FieldContent className="mt-3">
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                            <Checkbox
                              checked={field.value}
                              disabled={busy}
                              onCheckedChange={(c) => field.onChange(c === true)}
                            />
                            {field.value ? '已启用' : '已禁用'}
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
                        <FieldDescription>当前 {cgroupDriver || '默认'}</FieldDescription>
                        <FieldContent className="mt-3">
                          <RadioGroup
                            value={field.value === '' ? 'default' : field.value}
                            onValueChange={(v) => field.onChange(v === 'default' ? '' : v)}
                            disabled={busy}
                            className="flex flex-row flex-wrap items-center gap-x-5 gap-y-2"
                          >
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                              <RadioGroupItem value="default" id={`${daemonFormId}-cgroup-default`} />
                              默认
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
                      <FieldLabel className="text-sm font-medium text-foreground">Socket 路径</FieldLabel>
                      <FieldDescription>Docker 守护进程（Docker Daemon）与客户端之间的通信通道</FieldDescription>
                      <FieldContent className="mt-3">
                        <Input
                          {...field}
                          placeholder="unix:///var/run/docker.sock"
                          disabled={busy}
                          aria-invalid={fieldState.invalid}
                        />
                        <FieldError errors={[fieldState.error]} />
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
                      <FieldLabel className="text-sm font-medium text-foreground">日志切割</FieldLabel>
                      <FieldContent className="mt-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={field.value}
                            disabled={busy}
                            onCheckedChange={(c) => field.onChange(c === true)}
                          />
                          启用日志切割
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
                                    <FieldError errors={[fieldState.error]} />
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
                                    <FieldError errors={[fieldState.error]} />
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
