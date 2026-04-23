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

/** 根据前后两次累计字节差分计算端口转发的即时速率 */
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
