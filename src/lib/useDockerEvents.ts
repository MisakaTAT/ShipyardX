import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { DockerEvent, EventStreamStatus } from '../types'

const MAX_EVENTS = 500

interface UseDockerEventsOptions {
  serverId: string
  enabled?: boolean
  onRefresh?: (eventType: string) => void
}

interface UseDockerEventsReturn {
  events: DockerEvent[]
  status: EventStreamStatus
  clearEvents: () => void
}

export function useDockerEvents({
  serverId,
  enabled = true,
  onRefresh,
}: UseDockerEventsOptions): UseDockerEventsReturn {
  const [events, setEvents] = useState<DockerEvent[]>([])
  const [status, setStatus] = useState<EventStreamStatus>('connecting')
  const streamIdRef = useRef<string | null>(null)
  const unlistensRef = useRef<UnlistenFn[]>([])
  const onRefreshRef = useRef(onRefresh)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  onRefreshRef.current = onRefresh

  const cleanup = useCallback(async () => {
    for (const unlisten of unlistensRef.current) {
      unlisten()
    }
    unlistensRef.current = []

    for (const timer of Object.values(debounceTimers.current)) {
      clearTimeout(timer)
    }
    debounceTimers.current = {}

    if (streamIdRef.current) {
      try {
        await invoke('stop_event_stream', { serverId })
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
        const id = await invoke<string>('start_event_stream', { serverId })
        if (cancelled) {
          await invoke('stop_event_stream', { serverId }).catch(() => {})
          return
        }
        streamIdRef.current = id

        const unEvent = await listen<DockerEvent>(`docker-event:${id}`, (e) => {
          setEvents((prev) => {
            const next = [e.payload, ...prev]
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
          })
        })

        const unStatus = await listen<EventStreamStatus>(
          `docker-events-status:${id}`,
          (e) => {
            setStatus(e.payload)
          },
        )

        const unRefresh = await listen<string>(`docker-events-refresh:${id}`, (e) => {
          const eventType = e.payload

          if (debounceTimers.current[eventType]) {
            clearTimeout(debounceTimers.current[eventType])
          }

          debounceTimers.current[eventType] = setTimeout(() => {
            delete debounceTimers.current[eventType]
            onRefreshRef.current?.(eventType)
          }, 600)
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
