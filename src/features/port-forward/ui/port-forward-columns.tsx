import { openUrl } from '@tauri-apps/plugin-opener'
import { Play, Square, Trash2 } from 'lucide-react'
import type { PortForward, ServerConfig } from '@/types/app-bindings'
import { ToneBadge } from '@/shared/components/tone-badge'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import type { ColumnDef } from '@/shared/components'
import { PortForwardStatusBadge } from '@/features/port-forward/ui/port-forward-status-badge'
import { TrafficRow, WarnIcon } from '@/features/port-forward/ui/port-forward-cells'

interface BuildColumnsParams {
  serverById: Map<string, ServerConfig>
  onToggleEnabled: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
}

export function buildPortForwardColumns({
  serverById,
  onToggleEnabled,
  onDelete,
}: BuildColumnsParams): ColumnDef<PortForward>[] {
  return [
    {
      id: 'container',
      header: '容器',
      cell: ({ row }) => {
        const f = row.original
        return (
          <>
            <div className="font-medium text-foreground">{f.container_name ?? f.container_id.slice(0, 12)}</div>
            <div>{f.container_id.slice(0, 12)}</div>
          </>
        )
      },
    },
    {
      id: 'host',
      header: '主机',
      cell: ({ row }) => (
        <div className="text-foreground">{serverById.get(row.original.server_id)?.name ?? row.original.server_id}</div>
      ),
    },
    {
      id: 'protocol',
      header: '协议',
      meta: { className: 'whitespace-normal' },
      cell: ({ row }) => (
        <ToneBadge tone="info" className="uppercase">
          {row.original.protocol}
        </ToneBadge>
      ),
    },
    {
      id: 'local',
      header: '本地端口',
      meta: { width: '12rem' },
      cell: ({ row }) => {
        const f = row.original
        return f.running ? (
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
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
        )
      },
    },
    {
      id: 'target',
      header: '目标',
      cell: ({ row }) => (
        <>
          {row.original.remote_host}:{row.original.remote_port}
        </>
      ),
    },
    {
      id: 'status',
      header: '状态',
      cell: ({ row }) => {
        const f = row.original
        return (
          <div className="flex items-center gap-1.5">
            <PortForwardStatusBadge running={f.running} enabled={f.enabled} />
            {f.last_error ? (
              <span className="cursor-help text-red-500" title={f.last_error}>
                <WarnIcon />
              </span>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'traffic',
      header: '流量',
      meta: { width: '12rem' },
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <TrafficRow label="TX" tone="tx" value={row.original.tx} />
          <TrafficRow label="RX" tone="rx" value={row.original.rx} />
        </div>
      ),
    },
    {
      id: 'speed',
      header: '速度',
      meta: { width: '12rem' },
      cell: ({ row }) => {
        const f = row.original
        return (
          <div className="space-y-0.5">
            <TrafficRow label="TX" tone="tx" value={f.tx_speed} />
            <TrafficRow label="RX" tone="rx" value={f.rx_speed} />
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: '操作',
      meta: { width: '5rem' },
      cell: ({ row }) => {
        const f = row.original
        return (
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
        )
      },
    },
  ]
}
