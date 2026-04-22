import { openUrl } from '@tauri-apps/plugin-opener'
import { Play, Square, Trash2 } from 'lucide-react'
import type { PortForward, ServerConfig } from '@/types/app-bindings'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { formatBytes, formatSpeed } from '@/shared/lib/format'
import type { ColumnDef } from '@/shared/components'
import { PortForwardStatusBadge } from './port-forward-status-badge'
import type { SpeedMap } from '@/features/port-forward/hooks/use-speed-tracker'

interface BuildColumnsParams {
  serverById: Map<string, ServerConfig>
  speeds: SpeedMap
  onToggleEnabled: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
}

const WarnIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
    <path
      fillRule="evenodd"
      d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      clipRule="evenodd"
    />
  </svg>
)

const TrafficRow = ({ label, value, tone }: { label: 'TX' | 'RX'; value: string; tone: 'tx' | 'rx' }) => (
  <div className="flex items-center gap-2">
    <span
      className={cn(
        'inline-flex w-5 justify-center rounded font-sans text-[10px] font-medium',
        tone === 'tx' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'
      )}
    >
      {label}
    </span>
    <span>{value}</span>
  </div>
)

export function buildPortForwardColumns({
  serverById,
  speeds,
  onToggleEnabled,
  onDelete,
}: BuildColumnsParams): ColumnDef<PortForward>[] {
  return [
    {
      key: 'container',
      title: '容器',
      render: (f) => (
        <>
          <div className="font-medium text-foreground">{f.container_name ?? f.container_id.slice(0, 12)}</div>
          <div className="text-muted-foreground">{f.container_id.slice(0, 12)}</div>
        </>
      ),
    },
    {
      key: 'host',
      title: '主机',
      render: (f) => <div className="text-foreground">{serverById.get(f.server_id)?.name ?? f.server_id}</div>,
    },
    {
      key: 'protocol',
      title: '协议',
      className: 'whitespace-normal',
      render: (f) => (
        <Badge
          variant="outline"
          className="h-auto border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-500 uppercase"
        >
          {f.protocol}
        </Badge>
      ),
    },
    {
      key: 'local',
      title: '本地端口',
      width: '12rem',
      render: (f) =>
        f.running ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 text-foreground hover:underline"
            title="在浏览器中打开"
            onClick={() => void openUrl(`http://${f.bind_address}:${f.local_port}`)}
          >
            {f.bind_address}:{f.local_port}
          </button>
        ) : f.local_port > 0 ? (
          <>
            {f.bind_address}:{f.local_port}
          </>
        ) : (
          <span className="tracking-wide text-muted-foreground uppercase">random</span>
        ),
    },
    {
      key: 'target',
      title: '目标',
      render: (f) => (
        <>
          {f.remote_host}:{f.remote_port}
        </>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (f) => (
        <div className="flex items-center gap-1.5">
          <PortForwardStatusBadge running={f.running} enabled={f.enabled} />
          {f.last_error ? (
            <span className="cursor-help text-red-500" title={f.last_error}>
              <WarnIcon />
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'traffic',
      title: '流量',
      width: '12rem',
      render: (f) => (
        <div className="space-y-0.5">
          <TrafficRow label="TX" tone="tx" value={formatBytes(f.tx_bytes)} />
          <TrafficRow label="RX" tone="rx" value={formatBytes(f.rx_bytes)} />
        </div>
      ),
    },
    {
      key: 'speed',
      title: '速度',
      width: '12rem',
      render: (f) => {
        const sp = f.running ? speeds[f.id] : undefined
        return (
          <div className="space-y-0.5">
            <TrafficRow label="TX" tone="tx" value={formatSpeed(sp?.txSpeed ?? 0)} />
            <TrafficRow label="RX" tone="rx" value={formatSpeed(sp?.rxSpeed ?? 0)} />
          </div>
        )
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: '5rem',
      render: (f) => (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={f.enabled ? '禁用' : '启用'}
            onClick={() => onToggleEnabled(f.id, !f.enabled)}
            className={cn(
              'text-muted-foreground',
              f.enabled ? 'hover:bg-amber-500/10 hover:text-amber-500' : 'hover:bg-green-500/10 hover:text-green-500'
            )}
          >
            {f.enabled ? <Square /> : <Play />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="删除"
            onClick={() => onDelete(f.id)}
            className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ]
}
