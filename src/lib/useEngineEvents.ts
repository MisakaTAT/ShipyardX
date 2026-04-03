import { useEffect, useRef, useState, useCallback } from 'react'
import debounce from 'lodash-es/debounce'
import type { DebouncedFunc } from 'lodash-es/debounce'
import { commands, events } from '@/types/app-bindings'
import type { DockerEvent, EventStreamStatus } from '@/types/app-bindings'

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
  const [eventsList, setEventsList] = useState<DockerEvent[]>([])
  const [status, setStatus] = useState<EventStreamStatus>('connecting')
  const streamIdRef = useRef<string | null>(null)
  const unlistensRef = useRef<Array<() => void>>([])
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
        await commands.stopEventStream(serverId)
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
        const id = await commands.startEventStream(serverId)
        if (cancelled) {
          await commands.stopEventStream(serverId).catch(() => {})
          return
        }
        streamIdRef.current = id

        const unPayload = await events.dockerStreamPayload.listen((e) => {
          if (e.payload.stream_id !== id) return
          setEventsList((prev) => {
            const next = [e.payload.event, ...prev]
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
          })
        })

        const unStatus = await events.dockerStreamStatus.listen((e) => {
          if (e.payload.stream_id !== id) return
          setStatus(e.payload.status)
        })

        const unRefresh = await events.dockerStreamRefresh.listen((e) => {
          if (e.payload.stream_id !== id) return
          const eventType = e.payload.resource
          let d = refreshDebouncers.current.get(eventType)
          if (!d) {
            d = debounce(() => {
              onRefreshRef.current?.(eventType)
            }, 600)
            refreshDebouncers.current.set(eventType, d)
          }
          d()
        })

        const unError = await events.dockerStreamError.listen((e) => {
          if (e.payload.stream_id !== id) return
          /* 错误为瞬时提示，状态由 status 事件反映 */
        })

        if (cancelled) {
          unPayload()
          unStatus()
          unRefresh()
          unError()
          return
        }

        unlistensRef.current = [unPayload, unStatus, unRefresh, unError]
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

  const clearEvents = useCallback(() => setEventsList([]), [])

  return { events: eventsList, status, clearEvents }
}
