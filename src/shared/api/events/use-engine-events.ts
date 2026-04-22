import { useEffect, useRef, useState, useCallback } from 'react'
import debounce from 'lodash-es/debounce'
import type { DebouncedFunc } from 'lodash-es/debounce'
import { commands, events } from '@/types/app-bindings'
import type {
  DockerEvent,
  DockerStreamPayload,
  DockerStreamRefresh,
  DockerStreamStatus,
  EventStreamStatus,
} from '@/types/app-bindings'

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
      let localId: string | null = null
      const pendingPayload: DockerStreamPayload[] = []
      const pendingStatus: DockerStreamStatus[] = []
      const pendingRefresh: DockerStreamRefresh[] = []

      const applyPayload = (p: DockerStreamPayload) => {
        setEventsList((prev) => {
          const next = [p.event, ...prev]
          return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
        })
      }
      const applyStatus = (p: DockerStreamStatus) => setStatus(p.status)
      const applyRefresh = (p: DockerStreamRefresh) => {
        const eventType = p.resource
        let d = refreshDebouncers.current.get(eventType)
        if (!d) {
          d = debounce(() => onRefreshRef.current?.(eventType), 600)
          refreshDebouncers.current.set(eventType, d)
        }
        d()
      }

      const unPayload = await events.dockerStreamPayload.listen((e) => {
        if (localId === null) pendingPayload.push(e.payload)
        else if (e.payload.stream_id === localId) applyPayload(e.payload)
      })
      const unStatus = await events.dockerStreamStatus.listen((e) => {
        if (localId === null) pendingStatus.push(e.payload)
        else if (e.payload.stream_id === localId) applyStatus(e.payload)
      })
      const unRefresh = await events.dockerStreamRefresh.listen((e) => {
        if (localId === null) pendingRefresh.push(e.payload)
        else if (e.payload.stream_id === localId) applyRefresh(e.payload)
      })
      const unError = await events.dockerStreamError.listen(() => {
        /* 错误为瞬时提示，状态由 status 事件反映 */
      })

      try {
        const id = await commands.startEventStream(serverId)
        if (cancelled) {
          unPayload()
          unStatus()
          unRefresh()
          unError()
          await commands.stopEventStream(serverId).catch(() => {})
          return
        }
        streamIdRef.current = id
        localId = id

        for (const p of pendingStatus) if (p.stream_id === id) applyStatus(p)
        for (const p of pendingPayload) if (p.stream_id === id) applyPayload(p)
        for (const p of pendingRefresh) if (p.stream_id === id) applyRefresh(p)
        pendingStatus.length = 0
        pendingPayload.length = 0
        pendingRefresh.length = 0

        unlistensRef.current = [unPayload, unStatus, unRefresh, unError]
      } catch {
        unPayload()
        unStatus()
        unRefresh()
        unError()
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
