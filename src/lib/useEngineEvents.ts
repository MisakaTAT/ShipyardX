import { useEffect, useRef, useState, useCallback } from 'react'
import debounce from 'lodash-es/debounce'
import type { DebouncedFunc } from 'lodash-es/debounce'
import { startEventStream, stopEventStream } from '@/lib/commands'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { DockerEvent, EventStreamStatus } from '../types'

const MAX_EVENTS = 500

interface UseEngineEventsOptions {
  serverId: string
  enabled?: boolean
  onRefresh?: (eventType: string) => void
}

interface UseEngineEventsReturn {
  events: DockerEvent[]
  status: EventStreamStatus
  clearEvents: () => void
}

export function useEngineEvents({
  serverId,
  enabled = true,
  onRefresh,
}: UseEngineEventsOptions): UseEngineEventsReturn {
  const [events, setEvents] = useState<DockerEvent[]>([])
  const [status, setStatus] = useState<EventStreamStatus>('connecting')
  const streamIdRef = useRef<string | null>(null)
  const unlistensRef = useRef<UnlistenFn[]>([])
  const onRefreshRef = useRef(onRefresh)
  const refreshDebouncers = useRef<Map<string, DebouncedFunc<() => void>>>(new Map())

  onRefreshRef.current = onRefresh

  const cleanup = useCallback(async () => {
    for (const unlisten of unlistensRef.current) {
      unlisten()
    }
    unlistensRef.current = []

    for (const d of refreshDebouncers.current.values()) {
      d.cancel()
    }
    refreshDebouncers.current.clear()

    if (streamIdRef.current) {
      try {
        await stopEventStream({ serverId })
      } catch {
        /* ignore */
      }
      streamIdRef.current = null
    }
  }, [serverId])

  useEffect(() => {
    if (!enabled) {
      cleanup()
      return
    }

    let cancelled = false

    async function start() {
      try {
        const id = await startEventStream({ serverId })
        if (cancelled) {
          await stopEventStream({ serverId }).catch(() => {})
          return
        }
        streamIdRef.current = id

        const unEvent = await listen<DockerEvent>(`docker-event:${id}`, (e) => {
          setEvents((prev) => {
            const next = [e.payload, ...prev]
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
          })
        })

        const unStatus = await listen<EventStreamStatus>(`docker-events-status:${id}`, (e) => {
          setStatus(e.payload)
        })

        const unRefresh = await listen<string>(`docker-events-refresh:${id}`, (e) => {
          const eventType = e.payload
          let d = refreshDebouncers.current.get(eventType)
          if (!d) {
            d = debounce(() => {
              onRefreshRef.current?.(eventType)
            }, 600)
            refreshDebouncers.current.set(eventType, d)
          }
          d()
        })

        const unError = await listen<string>(`docker-events-error:${id}`, () => {
          /* errors are transient, status handles UI */
        })

        if (cancelled) {
          unEvent()
          unStatus()
          unRefresh()
          unError()
          return
        }

        unlistensRef.current = [unEvent, unStatus, unRefresh, unError]
      } catch {
        if (!cancelled) setStatus('disconnected')
      }
    }

    start()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [serverId, enabled, cleanup])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { events, status, clearEvents }
}
