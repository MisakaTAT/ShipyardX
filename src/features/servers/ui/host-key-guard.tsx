import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, ShieldQuestion } from 'lucide-react'
import { commands, events, type HostKeyPrompt } from '@/types/app-bindings'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/toast'
import { toastAppError } from '@/shared/lib/errors'

function Fingerprint({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <code
        className={`block rounded bg-muted px-2 py-1 font-mono text-[12px] break-all ${
          tone === 'danger' ? 'text-red-700 dark:text-red-400' : 'text-foreground'
        }`}
      >
        {value}
      </code>
    </div>
  )
}

/** 主机密钥首次出现或发生变化时展示指纹，由用户决定是否信任 */
export function HostKeyGuard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState<HostKeyPrompt | null>(null)

  const showPrompt = useCallback((next: HostKeyPrompt) => {
    setPrompt((prev) => prev ?? next)
  }, [])

  // 错误码在冒泡途中会被端口转发、Docker 传输层重写，只能靠后端事件触发
  useEffect(() => {
    const unlisten = events.hostKeyPromptRequired.listen((event) => showPrompt(event.payload.prompt))
    return () => {
      void unlisten.then((stop) => stop())
    }
  }, [showPrompt])

  // 监听器注册前就失败的连接收不到事件，挂载时补读一次
  useEffect(() => {
    void commands.getPendingHostKey().then((pending) => {
      if (pending) showPrompt(pending)
    })
  }, [showPrompt])

  const handleTrust = useCallback(async () => {
    if (!prompt) return
    try {
      await commands.trustHostKey(prompt.host, prompt.port, prompt.fingerprint)
      toast.success(t('ui.hostKeyGuard.trusted'), { description: `${prompt.host}:${prompt.port}` })
      await queryClient.invalidateQueries()
    } catch (error) {
      toastAppError(error, t('ui.hostKeyGuard.trustFailed'))
    }
  }, [prompt, queryClient, t])

  if (!prompt) return null

  const changed = Boolean(prompt.known_fingerprint)
  const Icon = changed ? ShieldAlert : ShieldQuestion

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) setPrompt(null)
      }}
      title={
        <span className="inline-flex items-center gap-2">
          <Icon className={`size-4 ${changed ? 'text-red-600 dark:text-red-400' : 'text-amber-600'}`} />
          {changed ? t('ui.hostKeyGuard.changedTitle') : t('ui.hostKeyGuard.firstTitle')}
        </span>
      }
      description={t(changed ? 'ui.hostKeyGuard.changedBody' : 'ui.hostKeyGuard.firstBody', {
        host: prompt.host,
        port: String(prompt.port),
      })}
      extra={
        <div className="space-y-3">
          {prompt.known_fingerprint ? (
            <Fingerprint label={t('ui.hostKeyGuard.knownLabel')} value={prompt.known_fingerprint} />
          ) : null}
          <Fingerprint
            label={t('ui.hostKeyGuard.currentLabel')}
            value={prompt.fingerprint}
            tone={changed ? 'danger' : undefined}
          />
        </div>
      }
      confirmText={changed ? t('ui.hostKeyGuard.trustNew') : t('ui.hostKeyGuard.trustContinue')}
      cancelText={t('ui.hostKeyGuard.cancelConnect')}
      destructive={changed}
      onConfirm={handleTrust}
    />
  )
}
