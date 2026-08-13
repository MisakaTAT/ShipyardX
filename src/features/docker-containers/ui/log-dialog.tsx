import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { commands } from '@/types/app-bindings'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { AnsiUp } from 'ansi_up'
import { Virtuoso } from 'react-virtuoso'
import { RefreshCw, Play, Square, Clock, Copy, Check } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { formatNowTime } from '@/shared/lib/datetime'
import { StandardFullScreenDialog } from '@/shared/components/standard-fullscreen-dialog'
import { toastAppError } from '@/shared/lib/errors'
import { sanitizeHtml } from '@/shared/lib/sanitize-html'

interface Props {
  serverId: string
  containerId: string
  containerName: string
  onClose: () => void
}

const TAIL_OPTIONS = [50, 100, 200, 500, 1000] as const

/** 跟踪刷屏容器时行数会无限增长，滚动裁剪 */
const MAX_LOG_LINES = 5000
/** 合并短时间内的多个分块再渲染 */
const FLUSH_INTERVAL_MS = 50

interface LogLineItem {
  id: number
  text: string
  html: string
}

function logPayloadToBytes(payload: unknown): Uint8Array | null {
  if (payload == null) return null
  if (payload instanceof Uint8Array) return payload
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload)
  if (Array.isArray(payload)) return new Uint8Array(payload as number[])
  return null
}

function getEventPayload(event: unknown): unknown {
  if (event && typeof event === 'object' && 'payload' in event) {
    return (event as { payload: unknown }).payload
  }
  return event
}

const LogLine = memo(function LogLine({ html }: { html: string }) {
  return (
    <div
      className="px-3 font-mono text-[13px] leading-[1.45] wrap-break-word text-[#e6edf3]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

export default function LogDialog({ serverId, containerId, containerName, onClose }: Props) {
  const { t } = useTranslation()
  // AnsiUp 有跨行颜色状态，必须在入队时按顺序转换，不能放在会乱序重绘的虚拟列表回调里
  const ansiRef = useRef(new AnsiUp())
  const pendingRef = useRef<LogLineItem[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextLineIdRef = useRef(0)

  const streamDecoderRef = useRef(new TextDecoder('utf-8', { fatal: false }))
  const streamLineBufferRef = useRef('')
  const streamIdRef = useRef<string | null>(null)
  const unlistenDataRef = useRef<UnlistenFn | null>(null)
  const unlistenDoneRef = useRef<UnlistenFn | null>(null)

  const [tail, setTail] = useState<number>(100)
  const [timestamps, setTimestamps] = useState(false)
  const [follow, setFollow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lines, setLines] = useState<LogLineItem[]>([])

  const flushPending = useCallback(() => {
    flushTimerRef.current = null
    const pending = pendingRef.current
    if (pending.length === 0) return
    pendingRef.current = []
    setLines((prev) => {
      const next = prev.concat(pending)
      return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next
    })
  }, [])

  const appendLines = useCallback(
    (rawLines: string[]) => {
      if (rawLines.length === 0) return
      for (const text of rawLines) {
        pendingRef.current.push({
          id: nextLineIdRef.current++,
          text,
          html: sanitizeHtml(ansiRef.current.ansi_to_html(text.length ? text : ' ')),
        })
      }
      if (flushTimerRef.current === null) {
        flushTimerRef.current = setTimeout(flushPending, FLUSH_INTERVAL_MS)
      }
    },
    [flushPending]
  )

  const resetLines = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    pendingRef.current = []
    nextLineIdRef.current = 0
    ansiRef.current = new AnsiUp()
    setLines([])
  }, [])

  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current)
    },
    []
  )

  const stopStream = useCallback(async () => {
    if (unlistenDataRef.current) {
      unlistenDataRef.current()
      unlistenDataRef.current = null
    }
    if (unlistenDoneRef.current) {
      unlistenDoneRef.current()
      unlistenDoneRef.current = null
    }
    if (streamIdRef.current) {
      try {
        await commands.stopLogStream(streamIdRef.current)
      } catch {
        /* ignore */
      }
      streamIdRef.current = null
    }
  }, [])

  const loadStaticLogs = useCallback(async () => {
    await stopStream()
    setLoading(true)
    resetLines()
    streamLineBufferRef.current = ''
    try {
      const logs = await commands.getContainerLogs(serverId, containerId, tail, timestamps)
      const normalized = logs.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      appendLines(normalized.length ? normalized.split('\n') : [])
    } catch (e) {
      toastAppError(e)
    } finally {
      setLoading(false)
    }
  }, [serverId, containerId, tail, timestamps, stopStream, resetLines, appendLines])

  const startFollow = useCallback(async () => {
    await stopStream()
    streamDecoderRef.current = new TextDecoder('utf-8', { fatal: false })
    streamLineBufferRef.current = ''
    resetLines()
    appendLines([`[${formatNowTime()}] ${t('ui.logs.connecting')}`])

    try {
      const streamId = await commands.startLogStream(serverId, containerId, tail, timestamps)
      streamIdRef.current = streamId

      unlistenDataRef.current = await listen(`log-data:${streamId}`, (event) => {
        const bytes = logPayloadToBytes(getEventPayload(event))
        if (!bytes?.length) return
        const chunk = streamDecoderRef.current.decode(bytes, { stream: true })
        streamLineBufferRef.current += chunk
        const buf = streamLineBufferRef.current
        const parts = buf.split('\n')
        const incomplete = parts.pop() ?? ''
        streamLineBufferRef.current = incomplete
        appendLines(parts)
      })

      unlistenDoneRef.current = await listen(`log-done:${streamId}`, () => {
        const flushed = streamDecoderRef.current.decode(new Uint8Array(), { stream: false })
        streamLineBufferRef.current += flushed ?? ''
        const remaining = streamLineBufferRef.current
        streamLineBufferRef.current = ''
        const tailParts = remaining.length ? remaining.split('\n') : []
        appendLines([...tailParts, `[${formatNowTime()}] ${t('ui.logs.ended')}`])
        setFollow(false)
        streamIdRef.current = null
      })
    } catch (e) {
      toastAppError(e)
      setFollow(false)
    }
  }, [t, serverId, containerId, tail, timestamps, stopStream, resetLines, appendLines])

  useEffect(() => {
    if (follow) {
      void startFollow()
    } else {
      void stopStream().then(() => loadStaticLogs())
    }
    return () => {
      void stopStream()
    }
    // 仅在 follow 切换时重启流；依赖变化不应触发重启
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow])

  useEffect(() => {
    if (!follow) {
      void loadStaticLogs()
    }
    // tail/timestamps 变化触发重载；loadStaticLogs 已依赖它们，避免重复执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tail, timestamps])

  useEffect(() => {
    void loadStaticLogs()
    // 仅挂载时拉取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClose = useCallback(async () => {
    await stopStream()
    onClose()
  }, [stopStream, onClose])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(lines.map((line) => line.text).join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [lines])

  const lineCount = lines.length

  return (
    <StandardFullScreenDialog
      open
      onOpenChange={(v) => (!v ? void handleClose() : null)}
      title={containerName}
      subtitle={t('ui.logs.subtitle')}
      showCloseButton
      headerActions={
        <>
          <Select value={String(tail)} disabled={follow} onValueChange={(v) => setTail(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAIL_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t('ui.logs.tail', { count: String(n) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={timestamps ? 'default' : 'outline'}
            disabled={follow}
            title={t('ui.logs.showTimestamps')}
            onClick={() => setTimestamps((v) => !v)}
          >
            <Clock />
            {t('ui.logs.timestamps')}
          </Button>

          <Button
            type="button"
            variant={follow ? 'default' : 'outline'}
            title={follow ? t('ui.logs.stopFollow') : t('ui.logs.startFollow')}
            onClick={() => setFollow((f) => !f)}
          >
            {follow ? (
              <>
                <Square />
                {t('ui.logs.stop')}
              </>
            ) : (
              <>
                <Play />
                {t('ui.logs.follow')}
              </>
            )}
          </Button>

          {!follow ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              title={t('ui.common.refresh')}
              onClick={() => void loadStaticLogs()}
            >
              <RefreshCw className={`${loading ? 'animate-spin' : ''}`} />
              {t('ui.common.refresh')}
            </Button>
          ) : null}

          <Button type="button" variant="outline" title={t('ui.logs.copyAll')} onClick={handleCopy}>
            {copied ? <Check className="text-green-500" /> : <Copy />}
            {t('ui.common.copy')}
          </Button>

          {lineCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {t('ui.logs.lineCount', { count: String(lineCount) })}
            </span>
          ) : null}
        </>
      }
    >
      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: '#0d1117' }}>
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              {t('ui.common.loading')}
            </div>
          </div>
        ) : null}
        <div className="absolute inset-0 min-h-0 p-2">
          <Virtuoso
            className="rounded-sm"
            style={{ height: '100%' }}
            data={lines}
            defaultItemHeight={22}
            followOutput={follow ? 'smooth' : false}
            computeItemKey={(_index, line) => line.id}
            itemContent={(_index, line) => <LogLine html={line.html} />}
          />
        </div>
      </div>
    </StandardFullScreenDialog>
  )
}
