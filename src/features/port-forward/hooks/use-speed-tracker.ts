import { useMemo, useRef } from 'react'
import type { PortForward } from '@/types/app-bindings'

interface SpeedEntry {
  txSpeed: number
  rxSpeed: number
}

export type SpeedMap = Record<string, SpeedEntry>

interface Snapshot {
  tx: number
  rx: number
  ts: number
}

/**
 * 计算端口转发规则的即时速率：比较本次与上次的累计字节差分，再除以时间。
 * 只在 `running` 的规则上生效。
 */
export function useSpeedTracker(rules: PortForward[]): SpeedMap {
  const prevRef = useRef<Record<string, Snapshot>>({})
  return useMemo(() => {
    const now = Date.now()
    const prev = prevRef.current
    const speeds: SpeedMap = {}
    const next: Record<string, Snapshot> = {}
    for (const r of rules) {
      next[r.id] = { tx: r.tx_bytes, rx: r.rx_bytes, ts: now }
      const p = prev[r.id]
      if (p && r.running) {
        const dt = (now - p.ts) / 1000
        if (dt > 0) {
          speeds[r.id] = {
            txSpeed: Math.max(0, (r.tx_bytes - p.tx) / dt),
            rxSpeed: Math.max(0, (r.rx_bytes - p.rx) / dt),
          }
        }
      }
    }
    prevRef.current = next
    return speeds
  }, [rules])
}
