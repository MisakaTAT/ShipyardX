import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { commands } from '@/types/app-bindings'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { AnsiUp } from 'ansi_up'
import { Virtuoso } from 'react-virtuoso'
import { RefreshCw, Play, Square, Clock, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogCloseIconButton,
  DialogContent,
  DialogFullscreenBody,
  DialogLoadingOverlay,
  DialogPanelMeta,
  DialogPanelTitle,
  DialogPanelToolbar,
  DialogPanelToolbarEnd,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNowTime } from '@/utils/datetime'

interface Props {
  serverId: string
  containerId: string
  containerName: string
  onClose: () => void
}

const TAIL_OPTIONS = [50, 100, 200, 500, 1000] as const

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

function LogLine({ line, ansi }: { line: string; ansi: AnsiUp }) {
  const html = useMemo(() => ansi.ansi_to_html(line.length ? line : '\u00a0'), [ansi, line])
  return (
    <div
      className="px-3 font-mono text-[13px] leading-[1.45] wrap-break-word text-[#e6edf3]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function LogDialog({ serverId, containerId, containerName, onClose }: Props) {
  const ansi = useMemo(() => new AnsiUp(), [])

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
  const [lines, setLines] = useState<string[]>([])

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
    setLines([])
    streamLineBufferRef.current = ''
    try {
      const logs = await commands.getContainerLogs(serverId, containerId, tail, timestamps)
      const normalized = logs.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      setLines(normalized.length ? normalized.split('\n') : [])
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId, containerId, tail, timestamps, stopStream])

  const startFollow = useCallback(async () => {
    await stopStream()
    streamDecoderRef.current = new TextDecoder('utf-8', { fatal: false })
    streamLineBufferRef.current = ''
    setLines([`[${formatNowTime()}] 正在连接日志流...`])

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
        if (parts.length) {
          setLines((prev) => [...prev, ...parts])
        }
      })

      unlistenDoneRef.current = await listen(`log-done:${streamId}`, () => {
        const flushed = streamDecoderRef.current.decode(new Uint8Array(), { stream: false })
        streamLineBufferRef.current += flushed ?? ''
        const remaining = streamLineBufferRef.current
        streamLineBufferRef.current = ''
        const tailParts = remaining.length ? remaining.split('\n') : []
        setLines((prev) => [...prev, ...tailParts, `[${formatNowTime()}] 日志流已结束`])
        setFollow(false)
        streamIdRef.current = null
      })
    } catch (e) {
      toast.error(String(e))
      setFollow(false)
    }
  }, [serverId, containerId, tail, timestamps, stopStream])

  useEffect(() => {
    if (follow) {
      void startFollow()
    } else {
      void stopStream().then(() => loadStaticLogs())
    }
    return () => {
      void stopStream()
    }
  }, [follow])

  useEffect(() => {
    if (!follow) {
      void loadStaticLogs()
    }
  }, [tail, timestamps])

  useEffect(() => {
    void loadStaticLogs()
  }, [])

  const handleClose = useCallback(async () => {
    await stopStream()
    onClose()
  }, [stopStream, onClose])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [lines])

  const lineCount = lines.length

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) void handleClose()
      }}
    >
      <DialogContent variant="fullscreen">
        <DialogPanelToolbar>
          <DialogPanelTitle>{containerName}</DialogPanelTitle>
          <DialogPanelMeta>日志</DialogPanelMeta>

          <Select value={String(tail)} disabled={follow} onValueChange={(v) => setTail(Number(v))}>
            <SelectTrigger className="w-fit shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAIL_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  后 {n} 行
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={timestamps ? 'default' : 'outline'}
            disabled={follow}
            title="显示时间戳"
            onClick={() => setTimestamps((t) => !t)}
          >
            <Clock />
            时间戳
          </Button>

          <Button
            type="button"
            variant={follow ? 'default' : 'outline'}
            title={follow ? '停止跟踪' : '实时跟踪'}
            onClick={() => setFollow((f) => !f)}
          >
            {follow ? (
              <>
                <Square />
                停止
              </>
            ) : (
              <>
                <Play />
                跟踪
              </>
            )}
          </Button>

          {!follow ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              title="刷新"
              onClick={() => void loadStaticLogs()}
            >
              <RefreshCw className={`${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          ) : null}

          <Button type="button" variant="outline" title="复制全部" onClick={handleCopy}>
            {copied ? <Check className="text-green-500" /> : <Copy />}
            复制
          </Button>

          <DialogPanelToolbarEnd>
            {lineCount > 0 ? <span className="text-xs text-muted-foreground">{lineCount} 行</span> : null}
            <DialogCloseIconButton onClick={() => void handleClose()} />
          </DialogPanelToolbarEnd>
        </DialogPanelToolbar>

        <DialogFullscreenBody tone="log">
          {loading ? <DialogLoadingOverlay>加载中...</DialogLoadingOverlay> : null}
          <div className="absolute inset-0 min-h-0 p-2">
            <Virtuoso
              className="rounded-sm"
              style={{ height: '100%' }}
              data={lines}
              defaultItemHeight={22}
              followOutput={follow ? 'smooth' : false}
              itemContent={(_index, line) => <LogLine line={line} ansi={ansi} />}
            />
          </div>
        </DialogFullscreenBody>
      </DialogContent>
    </Dialog>
  )
}
