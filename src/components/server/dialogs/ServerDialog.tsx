import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { commands } from '@/types/app-bindings'
import { toast } from 'sonner'
import type { ServerConfig } from '@/types/app-bindings'
import {
  defaultServerFormValues,
  serverConfigToFormValues,
  serverFormSchema,
  serverTestConnectionSchema,
  type ServerFormValues,
} from '@/schema/serverFormSchema'
import { Server as ServerIcon, Loader2, Eye, EyeOff } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeaderBar } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'

interface ServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: ServerConfig | null
  onSave: (servers: ServerConfig[]) => void
}

export default function ServerDialog({ open, onOpenChange, server, onSave }: ServerDialogProps) {
  const baseId = useId()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isEdit = !!server

  const form = useForm<ServerFormValues>({
    resolver: zodResolver(serverFormSchema),
    defaultValues: defaultServerFormValues(),
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (!open) return
    form.reset(server ? serverConfigToFormValues(server) : defaultServerFormValues())
    setShowPassword(false)
  }, [open, server?.id])

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
  }

  const onSubmit = form.handleSubmit(async (values: ServerFormValues) => {
    setLoading(true)
    try {
      const payload: ServerConfig = {
        ...values,
        id: isEdit && server ? server.id : '',
        password: values.password || null,
        key_path: values.key_path || null,
        auth_type: values.auth_type,
      }
      let servers: ServerConfig[]
      if (isEdit && server) {
        servers = await commands.updateServer(payload)
      } else {
        servers = await commands.addServer(payload)
      }
      onSave(servers)
      onOpenChange(false)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  })

  const handleTest = async () => {
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
    setLoading(true)
    try {
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
      const msg = await commands.testConnectionDirect(testPayload)
      toast.success(msg)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }

  const authType = form.watch('auth_type')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent variant="panelMd">
        <DialogHeaderBar
          icon={<ServerIcon />}
          title={isEdit ? '编辑服务器' : '添加服务器'}
          onClose={() => onOpenChange(false)}
          closeDisabled={loading}
        />

        <form id={`${baseId}-server-form`} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogBody variant="split" className="min-h-0 flex-1 overflow-y-auto">
            <FieldGroup className="gap-4 p-4">
              <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${baseId}-name`} required>
                      服务器名称
                    </FieldLabel>
                    <FieldContent>
                      <Input id={`${baseId}-name`} {...field} placeholder="生产服务器" disabled={loading} />
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
                        <FieldLabel htmlFor={`${baseId}-host`} required>
                          主机地址
                        </FieldLabel>
                        <FieldContent>
                          <Input id={`${baseId}-host`} {...field} placeholder="192.168.1.100" disabled={loading} />
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
                      <FieldLabel htmlFor={`${baseId}-port`} required>
                        端口
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id={`${baseId}-port`}
                          type="number"
                          min={1}
                          max={65535}
                          disabled={loading}
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10)
                            field.onChange(Number.isFinite(n) ? n : 22)
                          }}
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
                      <Input id={`${baseId}-user`} {...field} placeholder="root" disabled={loading} />
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
                        disabled={loading}
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
                      <FieldLabel htmlFor={`${baseId}-pwd`} required>
                        密码
                      </FieldLabel>
                      <FieldContent>
                        <div className="relative">
                          <Input
                            id={`${baseId}-pwd`}
                            type={showPassword ? 'text' : 'password'}
                            {...field}
                            placeholder="SSH 登录密码"
                            disabled={loading}
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            icon
                            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
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
                      <FieldLabel htmlFor={`${baseId}-key`} required>
                        密钥路径
                      </FieldLabel>
                      <FieldContent>
                        <Input id={`${baseId}-key`} {...field} placeholder="~/.ssh/id_rsa" disabled={loading} />
                        <FieldError errors={[fieldState.error]} />
                      </FieldContent>
                    </Field>
                  )}
                />
              )}
            </FieldGroup>
          </DialogBody>
        </form>

        <DialogFooter variant="panelSplit">
          <Button type="button" variant="ghostSoft" disabled={loading} onClick={handleTest}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            测试连接
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghostSoft" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" form={`${baseId}-server-form`} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : null}
              {isEdit ? '保存' : '添加'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
