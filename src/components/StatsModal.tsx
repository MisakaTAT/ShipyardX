import { useEffect, useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Cpu, MemoryStick, Network, HardDrive, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ContainerStats } from '../types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/utils/formatBytes'
import { formatNowTime } from '@/utils/datetime'

interface Props {
  serverId: string
  containerId: string
  containerName: string
  onClose: () => void
}

interface GaugeProps {
  value: number
  color: string
  label: string
  sublabel?: string
}

function Gauge({ value, color, label, sublabel }: GaugeProps) {
  const pct = Math.min(100, Math.max(0, value))
  const stroke = 2 * Math.PI * 40
  const filled = (pct / 100) * stroke

  const colorMap: Record<string, string> = {
    blue: '#58a6ff',
    green: '#3fb950',
    yellow: '#d29922',
    red: '#ff7b72',
    purple: '#bc8cff',
    cyan: '#39c5cf',
  }
  const strokeColor = colorMap[pct > 85 ? 'red' : pct > 70 ? 'yellow' : color] ?? colorMap[color] ?? '#58a6ff'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-24">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={strokeColor}
            strokeWidth="10"
            strokeDasharray={`${filled} ${stroke - filled}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-(--text-strong)">{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-(--text-base)">{label}</div>
        {sublabel ? <div className="mt-0.5 text-xs text-(--text-muted)">{sublabel}</div> : null}
      </div>
    </div>
  )
}

interface StatRowProps {
  icon: React.ReactNode
  label: string
  value: string
  subvalue?: string
  color: string
}

function StatRow({ icon, label, value, subvalue, color }: StatRowProps) {
  const colorMap: Record<string, string> = {
    blue: '#58a6ff',
    green: '#3fb950',
    yellow: '#d29922',
    purple: '#bc8cff',
    cyan: '#39c5cf',
  }
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
      style={{ background: 'var(--bg-surface)' }}
    >
      <div className="shrink-0" style={{ color: colorMap[color] ?? '#58a6ff' }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-(--text-muted)">{label}</div>
        <div className="truncate text-sm font-semibold text-(--text-strong)">{value}</div>
        {subvalue ? <div className="text-xs text-(--text-soft)">{subvalue}</div> : null}
      </div>
    </div>
  )
}

export default function StatsModal({ serverId, containerId, containerName, onClose }: Props) {
  const [stats, setStats] = useState<ContainerStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const s = await invoke<ContainerStats>('get_container_stats', {
        serverId,
        containerId,
      })
      setStats(s)
      setLastUpdated(formatNowTime())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId, containerId])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  useEffect(() => {
    intervalRef.current = setInterval(fetchStats, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchStats])

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
          <Cpu className="size-4 text-(--accent-text)" />
          <DialogTitle className="flex-1 truncate font-mono text-sm font-semibold text-(--text-strong)">
            {containerName}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
            onClick={onClose}
          >
            <X className="size-4" />
            <span className="sr-only">关闭</span>
          </Button>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {loading && !stats ? (
            <div className="flex items-center justify-center gap-3 py-12 text-(--text-muted)">
              <div className="size-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm">获取资源数据中...</span>
            </div>
          ) : null}

          {stats ? (
            <>
              <div className="flex justify-around py-2">
                <Gauge value={stats.cpu_percent} color="blue" label="CPU 使用率" sublabel={`${stats.cpu_percent}%`} />
                <Gauge
                  value={stats.mem_percent}
                  color="green"
                  label="内存使用率"
                  sublabel={`${formatBytes(stats.mem_usage)} / ${formatBytes(stats.mem_limit)}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatRow
                  icon={<MemoryStick size={16} />}
                  label="内存使用"
                  value={formatBytes(stats.mem_usage)}
                  subvalue={`限制: ${formatBytes(stats.mem_limit)}`}
                  color="green"
                />
                <StatRow icon={<Cpu size={16} />} label="CPU" value={`${stats.cpu_percent}%`} color="blue" />
                <StatRow
                  icon={<Network size={16} />}
                  label="网络 接收 / 发送"
                  value={`${formatBytes(stats.net_rx)} / ${formatBytes(stats.net_tx)}`}
                  color="cyan"
                />
                <StatRow
                  icon={<HardDrive size={16} />}
                  label="磁盘 读 / 写"
                  value={`${formatBytes(stats.blk_read)} / ${formatBytes(stats.blk_write)}`}
                  color="purple"
                />
              </div>

              {lastUpdated ? <div className="text-center text-xs text-(--text-muted)">更新于 {lastUpdated}</div> : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
