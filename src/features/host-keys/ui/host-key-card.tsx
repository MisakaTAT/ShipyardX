import { Copy, Fingerprint, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import type { KnownHostEntry, ServerConfig } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import type { ProbeState } from '@/features/host-keys/model/host-key'

interface HostKeyCardProps {
  entry: KnownHostEntry
  servers: ServerConfig[]
  state?: ProbeState
  probeDisabled?: boolean
  onProbe: () => void
  onCopy: () => void
  onTrust: (fingerprint: string) => void
  onDelete: () => void
}

function FingerprintLine({ value, tone }: { value: string; tone?: 'danger' }) {
  return (
    <code
      className={cn(
        'block rounded-lg px-2.5 py-1.5 font-mono text-[11.5px] leading-4.25 break-all select-text',
        tone === 'danger' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-muted/60 text-muted-foreground'
      )}
    >
      {value}
    </code>
  )
}

function StatusLabel({ state }: { state?: ProbeState }) {
  if (!state || state.status === 'probing') return null

  if (state.status === 'match') {
    return <span className="shrink-0 text-[12px] text-emerald-600 dark:text-emerald-400">与服务器一致</span>
  }
  if (state.status === 'failed') {
    return (
      <span className="shrink-0 cursor-help text-[12px] text-muted-foreground" title={state.message}>
        检测失败
      </span>
    )
  }
  return <span className="shrink-0 text-[12px] font-medium text-red-600 dark:text-red-400">指纹不一致</span>
}

export function HostKeyCard({
  entry,
  servers,
  state,
  probeDisabled,
  onProbe,
  onCopy,
  onTrust,
  onDelete,
}: HostKeyCardProps) {
  const mismatch = state?.status === 'mismatch'
  const probing = state?.status === 'probing'
  const names = servers.map((server) => server.name).join('、')

  return (
    <div
      className={cn(
        'rounded-xl border bg-card px-3.5 py-3 transition-colors',
        mismatch ? 'border-red-500/40' : 'border-border'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-[10px]',
            mismatch
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : state?.status === 'match'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
          )}
        >
          <Fingerprint className="size-4.75" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-foreground" title={names || undefined}>
            {names || `${entry.host}:${entry.port}`}
          </div>
          <div className="truncate font-mono text-[12px] text-muted-foreground">
            {names ? `${entry.host}:${entry.port}` : '无关联服务器'}
          </div>
        </div>

        <StatusLabel state={state} />

        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="重新检测"
            disabled={probing || probeDisabled}
            onClick={onProbe}
            className={cn(
              'transition-colors disabled:opacity-100',
              probeDisabled && !probing ? 'text-muted-foreground/40' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <RefreshCw className={cn('size-3.5', probing && 'animate-spin')} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="复制指纹"
            onClick={onCopy}
            className="text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="删除"
            onClick={onDelete}
            className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-2.5">
        <FingerprintLine value={entry.fingerprint} />
      </div>

      {mismatch ? (
        <div className="mt-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted-foreground">服务器当前指纹</span>
            <Button type="button" variant="outline" size="xs" onClick={() => onTrust(state.fingerprint)}>
              <ShieldCheck />
              改为信任
            </Button>
          </div>
          <FingerprintLine value={state.fingerprint} tone="danger" />
        </div>
      ) : null}
    </div>
  )
}
