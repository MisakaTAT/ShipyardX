import { useCallback, useEffect, useState } from 'react'
import { commands } from '@/types/app-bindings'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import type { DaemonSettings, DaemonUpdate } from '@/types/app-bindings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  serverId: string
}

export default function DockerManagePanel({ serverId }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [mirrorText, setMirrorText] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [sudoPassword, setSudoPassword] = useState('')
  const [pendingAction, setPendingAction] = useState<'save' | 'restart' | null>(null)
  const [form, setForm] = useState<DaemonSettings>({
    mirror_urls: [],
    log_rotation: false,
    log_max_size: '10m',
    log_max_file: '3',
    live_restore: false,
    cgroup_driver: '',
    socket_path: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await commands.getDockerDaemonSettings(serverId)
      setForm({
        ...data,
        socket_path: data.socket_path === 'unix:///var/run/docker.sock' ? '' : data.socket_path,
      })
      setMirrorText(data.mirror_urls.join('\n'))
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    void load()
  }, [load])

  const setField = <K extends keyof DaemonSettings>(key: K, value: DaemonSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const shouldAskForPassword = (msg: string) => {
    return msg.includes('权限不足') || msg.includes('sudo') || msg.includes('提权失败')
  }

  const onSave = async (password?: string) => {
    const mirrorUrls = mirrorText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    const params: DaemonUpdate = {
      mirror_urls: mirrorUrls,
      log_rotation: form.log_rotation,
      log_max_size: form.log_max_size.trim(),
      log_max_file: form.log_max_file.trim(),
      live_restore: form.live_restore,
      cgroup_driver: form.cgroup_driver.trim(),
      socket_path: form.socket_path.trim(),
      sudo_password: password ?? null,
    }
    setSaving(true)
    try {
      await commands.updateDockerDaemonSettings(serverId, params)
      toast.success('Docker 配置已保存，需手动重启后生效。')
      setAuthOpen(false)
      setSudoPassword('')
      setPendingAction(null)
      await load()
    } catch (e) {
      const msg = String(e)
      if (!password && shouldAskForPassword(msg)) {
        setPendingAction('save')
        setAuthOpen(true)
        return
      }
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const onRestart = async (password?: string) => {
    setRestarting(true)
    try {
      await commands.restartDockerDaemon(serverId, password ?? null)

      let lastError = ''
      let recovered = false
      for (let i = 0; i < 20; i += 1) {
        try {
          await commands.checkDockerAccess(serverId)
          recovered = true
          break
        } catch (e) {
          lastError = String(e)
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      if (!recovered) {
        throw new Error(lastError || '重启命令已执行，但 Docker 尚未恢复连接，请稍后重试')
      }

      toast.success('重启完成')
      setAuthOpen(false)
      setSudoPassword('')
      setPendingAction(null)
      await load()
    } catch (e) {
      const msg = String(e)
      if (!password && shouldAskForPassword(msg)) {
        setPendingAction('restart')
        setAuthOpen(true)
        return
      }
      toast.error(msg)
    } finally {
      setRestarting(false)
    }
  }

  const submitAuth = async () => {
    const pwd = sudoPassword.trim()
    if (!pwd) {
      toast.error('请输入提权密码')
      return
    }
    if (pendingAction === 'save') {
      await onSave(pwd)
      return
    }
    if (pendingAction === 'restart') {
      await onRestart(pwd)
    }
  }

  return (
    <>
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-(--text-muted)" />
        </div>
      ) : (
        <div className="h-full overflow-auto">
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-(--bg-panel) p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-(--text-base)">镜像加速</div>
                  <div className="mt-1 text-xs text-(--text-muted)">支持多个地址，一行一个；为空则取消镜像加速。</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void onRestart()}
                    disabled={loading || saving || restarting}
                  >
                    {restarting ? (
                      <Loader2 className="size-3.5 animate-spin stroke-[2.5]" />
                    ) : (
                      <RotateCcw className="size-3.5 stroke-[2.5]" />
                    )}
                    重启 Docker
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void onSave()}
                    disabled={loading || saving || restarting}
                  >
                    {saving ? (
                      <Loader2 className="size-3.5 animate-spin stroke-[2.5]" />
                    ) : (
                      <Save className="size-3.5 stroke-[2.5]" />
                    )}
                    保存
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <textarea
                  value={mirrorText}
                  onChange={(e) => setMirrorText(e.target.value)}
                  placeholder={'https://docker.1panel.live\nhttps://mirror.example.com'}
                  className="h-24 w-full resize-none rounded-lg border border-(--border-sub) bg-(--bg-input) px-3 py-2 font-mono text-xs text-(--text-base) outline-none focus-visible:border-(--accent)"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <BoolField
                title="Live restore"
                description="允许在 Docker 守护进程异常停机时保留正在运行的容器状态"
                checked={form.live_restore}
                onChange={(v) => setField('live_restore', v)}
              />
              <Field title="cgroup driver" description={`当前：${form.cgroup_driver || '默认'}`}>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <label className="flex items-center gap-2 text-sm text-(--text-base)">
                    <input
                      type="radio"
                      name="cgroup-driver"
                      checked={!form.cgroup_driver}
                      onChange={() => setField('cgroup_driver', '')}
                      className="size-3.5 border-(--border-sub)"
                    />
                    默认
                  </label>
                  <label className="flex items-center gap-2 text-sm text-(--text-base)">
                    <input
                      type="radio"
                      name="cgroup-driver"
                      checked={form.cgroup_driver === 'systemd'}
                      onChange={() => setField('cgroup_driver', 'systemd')}
                      className="size-3.5 border-(--border-sub)"
                    />
                    systemd
                  </label>
                  <label className="flex items-center gap-2 text-sm text-(--text-base)">
                    <input
                      type="radio"
                      name="cgroup-driver"
                      checked={form.cgroup_driver === 'cgroupfs'}
                      onChange={() => setField('cgroup_driver', 'cgroupfs')}
                      className="size-3.5 border-(--border-sub)"
                    />
                    cgroupfs
                  </label>
                </div>
              </Field>
            </div>

            <Field title="Socket 路径" description="Docker 守护进程（Docker Daemon）与客户端之间的通信通道">
              <Input
                value={form.socket_path}
                onChange={(e) => setField('socket_path', e.target.value)}
                placeholder="unix:///var/run/docker.sock"
                className="border-(--border-sub) bg-(--bg-input) font-mono text-sm"
              />
            </Field>

            <Field title="日志切割">
              <label className="flex items-center gap-2 text-sm text-(--text-base)">
                <input
                  type="checkbox"
                  checked={form.log_rotation}
                  onChange={(e) => setField('log_rotation', e.target.checked)}
                  className="size-3.5 rounded border-(--border-sub)"
                />
                启用日志切割
              </label>
              {form.log_rotation ? (
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={form.log_max_size}
                    onChange={(e) => setField('log_max_size', e.target.value)}
                    placeholder="10m"
                    className="border-(--border-sub) bg-(--bg-input) font-mono text-sm"
                  />
                  <Input
                    value={form.log_max_file}
                    onChange={(e) => setField('log_max_file', e.target.value)}
                    placeholder="3"
                    className="border-(--border-sub) bg-(--bg-input) font-mono text-sm"
                  />
                </div>
              ) : null}
            </Field>
          </div>
        </div>
      )}

      <Dialog open={authOpen} onOpenChange={(v) => !saving && !restarting && setAuthOpen(v)}>
        <DialogContent showCloseButton={false} className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
            <DialogTitle className="flex-1 text-sm font-semibold text-(--text-strong)">请输入提权密码</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <p className="text-xs text-(--text-muted)">当前操作需要 sudo 权限，请输入服务器用户的提权密码。</p>
            <Input
              type="password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              placeholder="sudo 密码"
              className="border-(--border-sub) bg-(--bg-input) text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitAuth()
              }}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAuthOpen(false)
                  setSudoPassword('')
                  setPendingAction(null)
                }}
                disabled={saving || restarting}
              >
                取消
              </Button>
              <Button type="button" size="sm" onClick={() => void submitAuth()} disabled={saving || restarting}>
                {saving || restarting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                确认
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Field({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-(--bg-panel) p-4">
      <div className="text-sm font-medium text-(--text-base)">{title}</div>
      {description ? <div className="mt-1 text-xs text-(--text-muted)">{description}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

function BoolField({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Field title={title} description={description}>
      <label className="flex items-center gap-2 text-sm text-(--text-base)">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-3.5 rounded border-(--border-sub)"
        />
        {checked ? '已启用' : '已禁用'}
      </label>
    </Field>
  )
}
