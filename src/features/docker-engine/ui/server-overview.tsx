import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/types/app-bindings'
import { Box, Layers, Cpu, HardDrive } from 'lucide-react'
import { formatNowTime } from '@/shared/lib/datetime'
import { qk } from '@/shared/api/query-keys'

interface Props {
  serverId: string
}

export default function ServerOverview({ serverId }: Props) {
  const {
    data: info,
    isFetching: loading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: qk.dockerInfo(serverId),
    queryFn: () => commands.checkDockerAccess(serverId),
    retry: false,
  })

  const lastUpdated = dataUpdatedAt ? formatNowTime(new Date(dataUpdatedAt)) : ''

  if (!info && !loading) return null

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                <span className="text-xs tracking-wider text-muted-foreground uppercase">Host Overview</span>
              </div>
              <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{info?.name || '未知主机'}</h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {info?.os || 'Unknown OS'} {info?.os_version ? `· ${info.os_version}` : ''}
              </p>
            </div>
            {lastUpdated ? <span className="shrink-0 text-xs text-muted-foreground">更新于 {lastUpdated}</span> : null}
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <MetricCard icon={<Box size={14} />} label="容器总数" value={info?.containers ?? '-'} />
            <MetricCard icon={<Layers size={14} />} label="镜像数" value={info?.images ?? '-'} />
            <MetricCard icon={<Cpu size={14} />} label="CPU 核心" value={info?.ncpu ?? '-'} />
            <MetricCard icon={<HardDrive size={14} />} label="总内存" value={info?.mem_total ?? '-'} />
          </div>
        </div>

        {loading && !info ? (
          <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-6 text-xs text-muted-foreground">
            <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
            加载主机信息...
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <InfoSection title="容器状态">
              <StatusBar
                label="运行中"
                value={info?.containers_running ?? '0'}
                percent={info?.containers_running_percent ?? 0}
                color="bg-green-500"
              />
              <StatusBar
                label="已暂停"
                value={info?.containers_paused ?? '0'}
                percent={info?.containers_paused_percent ?? 0}
                color="bg-yellow-500"
              />
              <StatusBar
                label="已停止"
                value={info?.containers_stopped ?? '0'}
                percent={info?.containers_stopped_percent ?? 0}
                color="bg-slate-500"
              />
            </InfoSection>

            <InfoSection title="Docker 引擎">
              <InfoRow label="引擎版本" value={info?.server_version || '-'} />
              <InfoRow label="API 版本" value={info?.api_version || '-'} />
              <InfoRow label="存储驱动" value={info?.storage_driver || '-'} />
              <InfoRow label="警告数量" value={info?.warnings || '0'} highlight={info?.warnings !== '0'} />
            </InfoSection>

            <InfoSection title="主机系统">
              <InfoRow label="主机名" value={info?.name || '-'} />
              <InfoRow label="操作系统" value={info?.os || '-'} />
              <InfoRow label="内核版本" value={info?.kernel_version || '-'} />
              <InfoRow label="架构" value={info?.architecture || '-'} />
            </InfoSection>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  accent = 'normal',
}: {
  icon: ReactNode
  label: string
  value: string
  accent?: 'normal' | 'green' | 'yellow'
}) {
  const color = accent === 'green' ? 'text-green-500' : accent === 'yellow' ? 'text-yellow-500' : ''
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={`text-lg font-semibold ${color || 'text-foreground'}`}>{value}</div>
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string
  value: string
  icon?: ReactNode
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </div>
      <span className={highlight ? 'font-medium text-yellow-500' : 'font-medium text-foreground'}>{value}</span>
    </div>
  )
}

function StatusBar({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">
          {value} ({Math.round(percent)}%)
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  )
}
