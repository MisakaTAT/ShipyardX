import { useEffect, useRef, useState } from 'react'

export interface TrafficSample {
  /** 采样时刻（epoch ms）；左侧补零的占位点为 0，图表据此跳过时间标签 */
  at: number
  tx: number
  rx: number
}

/** 图表横轴保留的采样点数量，配合 1s 采样约等于最近一分钟。 */
export const TRAFFIC_CAPACITY = 60
const SAMPLE_INTERVAL_MS = 1000

/**
 * 后端推送的是瞬时速率而非历史序列，这里在前端按固定节奏补出时间轴。
 * 用 ref 读取最新值，避免速率每变一次就重建定时器导致采样间隔忽长忽短。
 */
export function useTrafficHistory(tx: number, rx: number, resetKey: string): TrafficSample[] {
  const latest = useRef({ tx, rx })
  latest.current = { tx, rx }

  const [samples, setSamples] = useState<TrafficSample[]>([])

  useEffect(() => {
    setSamples([])
  }, [resetKey])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      setSamples((prev) => {
        const next = prev.length >= TRAFFIC_CAPACITY ? prev.slice(prev.length - TRAFFIC_CAPACITY + 1) : prev.slice()
        next.push({ at: Date.now(), ...latest.current })
        return next
      })
    }, SAMPLE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return samples
}
