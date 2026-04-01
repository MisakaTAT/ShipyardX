import { useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Box, Layers, Cpu, HardDrive } from 'lucide-react'
import type { DockerInfo } from '../types'

interface Props {
  serverId: string
  refreshTick?: number
}

function fmtMem(bytes: number): string {
  const gb = bytes / 1_073_741_824
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`
}

function fmtPct(value: number, total: number): string {
  if (total <= 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

export default function ServerOverview({ serverId, refreshTick }: Props) {
  const [info, setInfo] = useState<DockerInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const d = await invoke<DockerInfo>('get_docker_info', { server_id: serverId })
      setInfo(d)
      setLastUpdated(new Date().toLocaleTimeString('zh-CN'))
    } catch {
      // 静默失败，服务器可能不支持 Docker
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetch()
  }, [fetch])

  useEffect(() => {
    if (refreshTick && refreshTick > 0) fetch()
  }, [refreshTick, fetch])

  if (!info && !loading) return null
  const totalContainers = info?.containers ?? 0
  const running = info?.containers_running ?? 0
  const paused = info?.containers_paused ?? 0
  const stopped = info?.containers_stopped ?? 0
  const warnings = info?.warnings ?? 0

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg-app)' }}>
      <div className="space-y-3">
        <div
          className="rounded-xl border border-border px-4 py-3 md:px-5 md:py-4"
          style={{ background: 'var(--bg-panel)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Host Overview
                </span>
              </div>
              <h2 className="text-base md:text-lg font-semibold mt-1 truncate" style={{ color: 'var(--text-strong)' }}>
                {info?.name || '未知主机'}
              </h2>
              <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-soft)' }}>
                {info?.os || 'Unknown OS'} {info?.os_version ? `· ${info.os_version}` : ''}
              </p>
            </div>
            {lastUpdated ? (
              <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                更新于 {lastUpdated}
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <MetricCard icon={<Box size={14} />} label="容器总数" value={String(totalContainers)} />
            <MetricCard icon={<Layers size={14} />} label="镜像数" value={String(info?.images ?? 0)} />
            <MetricCard icon={<Cpu size={14} />} label="CPU 核心" value={String(info?.ncpu ?? '—')} />
            <MetricCard icon={<HardDrive size={14} />} label="总内存" value={info ? fmtMem(info.mem_total) : '—'} />
          </div>
        </div>

        {loading && !info ? (
          <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-6 text-xs text-(--text-muted)">
            <div className="w-3 h-3 border border-(--accent) border-t-transparent rounded-full animate-spin" />
            加载主机信息...
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <InfoSection title="容器状态">
              <StatusBar label="运行中" value={running} total={totalContainers} color="bg-green-500" />
              <StatusBar label="已暂停" value={paused} total={totalContainers} color="bg-yellow-500" />
              <StatusBar label="已停止" value={stopped} total={totalContainers} color="bg-slate-500" />
            </InfoSection>

            <InfoSection title="Docker 引擎">
              <InfoRow label="引擎版本" value={info?.server_version || '—'} />
              <InfoRow label="API 版本" value={info?.api_version || '—'} />
              <InfoRow label="存储驱动" value={info?.storage_driver || '—'} />
              <InfoRow label="警告数量" value={String(warnings)} highlight={warnings > 0} />
            </InfoSection>

            <InfoSection title="主机系统">
              <InfoRow label="主机名" value={info?.name || '—'} />
              <InfoRow label="操作系统" value={info?.os || '—'} />
              <InfoRow label="内核版本" value={info?.kernel_version || '—'} />
              <InfoRow label="架构" value={info?.architecture || '—'} />
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
    <div className="rounded-lg border border-border px-3 py-2.5" style={{ background: 'var(--bg-surface)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span style={{ color: 'var(--text-soft)' }}>{icon}</span>
      </div>
      <div className={`text-lg font-semibold ${color}`} style={!color ? { color: 'var(--text-strong)' } : {}}>
        {value}
      </div>
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-3.5" style={{ background: 'var(--bg-panel)' }}>
      <div className="text-xs font-medium mb-3" style={{ color: 'var(--text-soft)' }}>
        {title}
      </div>
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
      <div className="flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-muted)' }}>
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </div>
      <span
        className={highlight ? 'text-yellow-500 font-medium' : 'font-medium'}
        style={!highlight ? { color: 'var(--text-base)' } : {}}
      >
        {value}
      </span>
    </div>
  )
}

function StatusBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ color: 'var(--text-base)' }}>
          {value} ({fmtPct(value, total)})
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-surface)' }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}
