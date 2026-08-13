import i18n from '@/app/i18n'
import { useEffect, useRef, useState, useCallback } from 'react'
import debounce from 'lodash-es/debounce'
import type { DebouncedFunc } from 'lodash-es/debounce'
import { commands, events } from '@/types/app-bindings'
import { toastAppError } from '@/shared/lib/errors'
import type {
  DockerEvent,
  DockerStreamError,
  DockerStreamPayload,
  DockerStreamRefresh,
  DockerStreamStatus,
  EventStreamStatus,
} from '@/types/app-bindings'

const MAX_EVENTS = 500
const ERROR_TOAST_THRESHOLD = 3
const ERROR_TOAST_COOLDOWN_MS = 10_000
/** `docker compose up` 之类操作会瞬间刷出大量事件 */
const EVENT_FLUSH_INTERVAL_MS = 100

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
  const errorStreakRef = useRef(0)
  const lastErrorToastRef = useRef<{ key: string; at: number } | null>(null)
  const pendingEventsRef = useRef<DockerEvent[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  onRefreshRef.current = onRefresh

  const flushEvents = useCallback(() => {
    flushTimerRef.current = null
    const pending = pendingEventsRef.current
    if (pending.length === 0) return
    pendingEventsRef.current = []
    setEventsList((prev) => {
      // 倒序展示，新的一批整体放最前
      const next = pending.reverse().concat(prev)
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
    })
  }, [])

  const clearPendingEvents = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    pendingEventsRef.current = []
  }, [])

  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current)
    },
    []
  )

  const cleanup = useCallback(async () => {
    for (const unlisten of unlistensRef.current) {
      unlisten()
    }
    unlistensRef.current = []

    for (const d of refreshDebouncers.current.values()) {
      d.cancel()
    }
    refreshDebouncers.current.clear()
    errorStreakRef.current = 0
    lastErrorToastRef.current = null
    clearPendingEvents()
    setEventsList([])
    setStatus('disconnected')

    if (streamIdRef.current) {
      try {
        await commands.stopEventStream(serverId)
      } catch {
        /* ignore */
      }
      streamIdRef.current = null
    }
  }, [serverId, clearPendingEvents])

  useEffect(() => {
    if (!enabled) {
      cleanup()
      return
    }

    let cancelled = false

    setEventsList([])
    setStatus('connecting')

    async function start() {
      let localId: string | null = null
      const pendingPayload: DockerStreamPayload[] = []
      const pendingStatus: DockerStreamStatus[] = []
      const pendingRefresh: DockerStreamRefresh[] = []
      const pendingErrors: DockerStreamError[] = []

      const applyPayload = (p: DockerStreamPayload) => {
        pendingEventsRef.current.push(p.event)
        if (flushTimerRef.current === null) {
          flushTimerRef.current = setTimeout(flushEvents, EVENT_FLUSH_INTERVAL_MS)
        }
      }
      const applyStatus = (p: DockerStreamStatus) => {
        if (p.status === 'connected') {
          errorStreakRef.current = 0
          lastErrorToastRef.current = null
        }
        setStatus(p.status)
      }
      const applyError = (p: DockerStreamError) => {
        errorStreakRef.current += 1

        if (errorStreakRef.current < ERROR_TOAST_THRESHOLD) {
          return
        }

        const key = `${p.error.code}:${p.error.detail ?? ''}`
        const now = Date.now()
        const lastToast = lastErrorToastRef.current
        if (lastToast && lastToast.key === key && now - lastToast.at < ERROR_TOAST_COOLDOWN_MS) {
          return
        }

        lastErrorToastRef.current = { key, at: now }
        toastAppError(p.error, i18n.t('ui.events.streamFailed'))
      }
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
      const unError = await events.dockerStreamError.listen((e) => {
        if (localId === null) pendingErrors.push(e.payload)
        else if (e.payload.stream_id === localId) applyError(e.payload)
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
        for (const p of pendingErrors) if (p.stream_id === id) applyError(p)
        pendingStatus.length = 0
        pendingPayload.length = 0
        pendingRefresh.length = 0
        pendingErrors.length = 0

        unlistensRef.current = [unPayload, unStatus, unRefresh, unError]
      } catch {
        unPayload()
        unStatus()
        unRefresh()
        unError()
        if (!cancelled) {
          setEventsList([])
          setStatus('disconnected')
        }
      }
    }

    start()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [serverId, enabled, cleanup, flushEvents])

  const clearEvents = useCallback(() => {
    clearPendingEvents()
    setEventsList([])
  }, [clearPendingEvents])

  return { events: eventsList, status, clearEvents }
}
