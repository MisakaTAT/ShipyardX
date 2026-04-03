import { useState, useEffect } from 'react'
import { addServer, testConnectionDirect, updateServer } from '@/lib/commands'
import { toast } from 'sonner'
import { Server } from '../types'
import { Server as ServerIcon, X, Loader2, Eye, EyeOff } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ServerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: Server | null
  onSave: (servers: Server[]) => void
}

const defaultForm = (): Omit<Server, 'id'> => ({
  name: '',
  host: '',
  port: 22,
  username: 'root',
  auth_type: 'key',
  password: '',
  key_path: '~/.ssh/id_rsa',
})

export default function ServerModal({ open, onOpenChange, server, onSave }: ServerModalProps) {
  const [form, setForm] = useState<Omit<Server, 'id'>>(server ? { ...server } : defaultForm())
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isEdit = !!server

  useEffect(() => {
    if (!open) return
    setForm(server ? { ...server } : defaultForm())
    setShowPassword(false)
  }, [open, server?.id])

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
  }

  const update = (key: keyof Omit<Server, 'id'>, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) return toast.warning('请填写服务器名称')
    if (!form.host.trim()) return toast.warning('请填写主机地址')
    if (!form.username.trim()) return toast.warning('请填写用户名')
    if (form.auth_type === 'password' && !form.password?.trim()) return toast.warning('请填写密码')
    if (form.auth_type === 'key' && !form.key_path?.trim()) return toast.warning('请填写密钥路径')

    setLoading(true)
    try {
      let servers: Server[]
      if (isEdit && server) {
        servers = await updateServer({
          server: { ...form, id: server.id },
        })
      } else {
        servers = await addServer({
          server: { ...form, id: '' },
        })
      }
      onSave(servers)
      onOpenChange(false)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!form.host.trim()) return toast.warning('请先填写主机地址')
    if (!form.username.trim()) return toast.warning('请先填写用户名')
    if (form.auth_type === 'password' && !form.password?.trim()) return toast.warning('请填写密码')
    if (form.auth_type === 'key' && !form.key_path?.trim()) return toast.warning('请填写密钥路径')
    setLoading(true)
    try {
      const msg = await testConnectionDirect({
        server: { ...form, id: server?.id ?? '' },
      })
      toast.success(msg)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
          <ServerIcon className="size-4 text-(--accent-text)" />
          <DialogTitle className="flex-1 text-sm font-semibold text-(--text-strong)">
            {isEdit ? '编辑服务器' : '添加服务器'}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-(--text-soft)">服务器名称 *</Label>
            <Input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="例如：生产服务器"
              className="h-10 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs text-(--text-soft)">主机地址 *</Label>
              <Input
                value={form.host}
                onChange={(e) => update('host', e.target.value)}
                placeholder="192.168.1.100"
                className="h-10 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-(--text-soft)">端口</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => update('port', parseInt(e.target.value, 10) || 22)}
                min={1}
                max={65535}
                className="h-10 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-(--text-soft)">用户名 *</Label>
            <Input
              value={form.username}
              onChange={(e) => update('username', e.target.value)}
              placeholder="root"
              className="h-10 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-(--text-soft)">认证方式</Label>
            <div className="flex gap-2">
              {(['key', 'password'] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={form.auth_type === type ? 'default' : 'outline'}
                  className="flex-1 text-sm"
                  onClick={() => update('auth_type', type)}
                >
                  {type === 'key' ? 'SSH 密钥' : '密码'}
                </Button>
              ))}
            </div>
          </div>

          {form.auth_type === 'password' ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-(--text-soft)">密码 *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password || ''}
                  onChange={(e) => update('password', e.target.value)}
                  placeholder="SSH 登录密码"
                  className="h-10 pr-10 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-(--text-soft)">密钥路径 *</Label>
              <Input
                value={form.key_path || ''}
                onChange={(e) => update('key_path', e.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="h-10 text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            className="text-(--text-soft) hover:bg-(--bg-surface) hover:text-(--text-base)"
            onClick={handleTest}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
            测试连接
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-(--text-soft) hover:bg-(--bg-surface) hover:text-(--text-base)"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="button" size="sm" disabled={loading} onClick={handleSave}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {isEdit ? '保存' : '添加'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
