import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import type { ServerConfig } from '@/types/app-bindings'
import {
  defaultServerFormValues,
  serverConfigToFormValues,
  serverFormSchema,
  serverTestConnectionSchema,
  type ServerFormValues,
} from '@/features/servers/model/schema'
import { Server as ServerIcon, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { toast } from '@/shared/components/toast'
import { useSaveServer, useTestServerConnection } from '@/features/servers/api/use-servers'

interface ServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: ServerConfig | null
}

export default function ServerDialog({ open, onOpenChange, server }: ServerDialogProps) {
  const baseId = useId()
  const [showPassword, setShowPassword] = useState(false)
  const isEdit = !!server
  const saveServer = useSaveServer()
  const testConnection = useTestServerConnection()

  const form = useForm<ServerFormValues>({
    resolver: zodResolver(serverFormSchema),
    defaultValues: defaultServerFormValues(),
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!open) return
    form.reset(server ? serverConfigToFormValues(server) : defaultServerFormValues())
    setShowPassword(false)
  }, [open, server, form])

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
  }

  const onSubmit = form.handleSubmit((values: ServerFormValues) => {
    const payload: ServerConfig = {
      ...values,
      id: isEdit && server ? server.id : '',
      password: values.password || null,
      key_path: values.key_path || null,
      auth_type: values.auth_type,
    }
    saveServer.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false)
      },
    })
  })

  const handleTest = () => {
    const full = form.getValues()
    const parsed = serverTestConnectionSchema.safeParse({
      host: full.host,
      username: full.username,
      auth_type: full.auth_type,
      password: full.password,
      key_path: full.key_path,
    })
    if (!parsed.success) {
      toast.warning(parsed.error.issues[0]?.message ?? '校验失败')
      return
    }
    const testPayload: ServerConfig = {
      id: server?.id ?? '',
      name: full.name,
      host: full.host,
      port: full.port,
      username: full.username,
      auth_type: full.auth_type,
      password: full.password || null,
      key_path: full.key_path || null,
    }
    testConnection.mutate(testPayload, {
      onSuccess: (msg) => {
        toast.success(msg)
      },
    })
  }

  const authType = form.watch('auth_type')
  const busy = saveServer.isPending || testConnection.isPending

  return (
    <StandardDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={isEdit ? '编辑服务器' : '添加服务器'}
      icon={ServerIcon}
      disableClose={busy}
      widthClassName="w-[640px]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={handleTest}>
            {testConnection.isPending ? <Loader2 className="animate-spin" /> : null}
            测试连接
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" form={`${baseId}-server-form`} disabled={busy}>
              {saveServer.isPending ? <Loader2 className="animate-spin" /> : null}
              {isEdit ? '保存' : '添加'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={`${baseId}-server-form`} onSubmit={onSubmit} className="contents">
        <FieldGroup className="gap-4">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${baseId}-name`}>服务器名称</FieldLabel>
                <FieldContent>
                  <Input
                    id={`${baseId}-name`}
                    {...field}
                    placeholder="生产服务器"
                    disabled={busy}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Controller
                control={form.control}
                name="host"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${baseId}-host`}>主机地址</FieldLabel>
                    <FieldContent>
                      <Input
                        id={`${baseId}-host`}
                        {...field}
                        placeholder="192.168.1.100"
                        disabled={busy}
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
              name="port"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${baseId}-port`}>端口</FieldLabel>
                  <FieldContent>
                    <Input
                      id={`${baseId}-port`}
                      type="number"
                      min={1}
                      max={65535}
                      disabled={busy}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10)
                        field.onChange(Number.isFinite(n) ? n : 22)
                      }}
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
            name="username"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${baseId}-user`}>用户名</FieldLabel>
                <FieldContent>
                  <Input
                    id={`${baseId}-user`}
                    {...field}
                    placeholder="root"
                    disabled={busy}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />

          <Field>
            <FieldLabel>认证方式</FieldLabel>
            <FieldContent>
              <div className="flex gap-2">
                {(['key', 'password'] as const).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={authType === type ? 'default' : 'outline'}
                    className="flex-1 text-sm"
                    disabled={busy}
                    onClick={() => form.setValue('auth_type', type, { shouldValidate: true })}
                  >
                    {type === 'key' ? 'SSH 密钥' : '密码'}
                  </Button>
                ))}
              </div>
            </FieldContent>
          </Field>

          {authType === 'password' ? (
            <Controller
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${baseId}-pwd`}>密码</FieldLabel>
                  <FieldContent>
                    <div className="relative">
                      <Input
                        id={`${baseId}-pwd`}
                        type={showPassword ? 'text' : 'password'}
                        {...field}
                        placeholder="SSH 登录密码"
                        disabled={busy}
                        className="pr-10"
                        aria-invalid={fieldState.invalid}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                    </div>
                    <FieldError errors={[fieldState.error]} />
                  </FieldContent>
                </Field>
              )}
            />
          ) : (
            <Controller
              control={form.control}
              name="key_path"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${baseId}-key`}>密钥路径</FieldLabel>
                  <FieldContent>
                    <Input
                      id={`${baseId}-key`}
                      {...field}
                      placeholder="~/.ssh/id_rsa"
                      disabled={busy}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </FieldContent>
                </Field>
              )}
            />
          )}
        </FieldGroup>
      </form>
    </StandardDialog>
  )
}
