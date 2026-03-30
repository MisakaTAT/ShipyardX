import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { X, RefreshCw, Play, Square, Clock, Copy, Check } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  serverId: string
  containerId: string
  containerName: string
  onClose: () => void
}

const TAIL_OPTIONS = [50, 100, 200, 500, 1000] as const

function formatTimestamp(): string {
  return new Date().toLocaleTimeString('zh-CN')
}

export default function LogModal({ serverId, containerId, containerName, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const streamIdRef = useRef<string | null>(null)
  const unlistenDataRef = useRef<UnlistenFn | null>(null)
  const unlistenDoneRef = useRef<UnlistenFn | null>(null)

  const [tail, setTail] = useState<number>(100)
  const [timestamps, setTimestamps] = useState(false)
  const [follow, setFollow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [lineCount, setLineCount] = useState(0)

  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#e6edf3',
        black: '#21262d',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
        selectionBackground: '#264f78',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: 5000,
      disableStdin: true,
      cursorBlink: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    setTimeout(() => fitAddon.fit(), 50)

    termRef.current = term
    fitAddonRef.current = fitAddon

    const ro = new ResizeObserver(() => fitAddon.fit())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [])

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
        await invoke('stop_log_stream', { streamId: streamIdRef.current })
      } catch {
        /* ignore */
      }
      streamIdRef.current = null
    }
  }, [])

  const loadStaticLogs = useCallback(async () => {
    await stopStream()
    setError('')
    setLoading(true)
    termRef.current?.clear()
    setLineCount(0)
    try {
      const logs = await invoke<string>('get_container_logs', {
        serverId,
        containerId,
        tail,
        timestamps,
      })
      if (termRef.current) {
        const lines = logs.split('\n')
        setLineCount(lines.filter((l) => l).length)
        termRef.current.write(logs.replace(/\r?\n/g, '\r\n'))
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [serverId, containerId, tail, timestamps, stopStream])

  const startFollow = useCallback(async () => {
    await stopStream()
    setError('')
    termRef.current?.clear()
    setLineCount(0)
    termRef.current?.write(`\x1b[2m[${formatTimestamp()}] 正在连接日志流...\x1b[0m\r\n`)

    try {
      const streamId = await invoke<string>('start_log_stream', {
        serverId,
        containerId,
        tail,
        timestamps,
      })
      streamIdRef.current = streamId

      let count = 0
      unlistenDataRef.current = await listen<number[]>(`log-data:${streamId}`, (event) => {
        const bytes = new Uint8Array(event.payload)
        termRef.current?.write(bytes)
        count += event.payload.filter((b: number) => b === 10).length
        setLineCount(count)
      })

      unlistenDoneRef.current = await listen(`log-done:${streamId}`, () => {
        termRef.current?.write(`\r\n\x1b[2m[${formatTimestamp()}] 日志流已结束\x1b[0m\r\n`)
        setFollow(false)
        streamIdRef.current = null
      })
    } catch (e) {
      setError(String(e))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow 切换驱动拉流/静态
  }, [follow])

  useEffect(() => {
    if (!follow) {
      void loadStaticLogs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tail/timestamps 变更刷新静态日志
  }, [tail, timestamps])

  useEffect(() => {
    void loadStaticLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载时加载
  }, [])

  const handleClose = useCallback(async () => {
    await stopStream()
    onClose()
  }, [stopStream, onClose])

  const handleCopy = useCallback(() => {
    if (!termRef.current) return
    termRef.current.selectAll()
    const fullText = termRef.current.getSelection()
    termRef.current.clearSelection()
    void navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [])

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) void handleClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[80vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3"
          style={{ background: 'var(--bg-panel)' }}
        >
          <span className="mr-1 font-mono text-sm font-semibold text-(--text-strong)">{containerName}</span>
          <span className="mr-2 text-xs text-(--text-muted)">日志</span>

          <Select value={String(tail)} disabled={follow} onValueChange={(v) => setTail(Number(v))}>
            <SelectTrigger
              size="sm"
              className="h-7 border-(--border-sub) bg-(--bg-surface) text-xs text-(--text-base)"
            >
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
            variant="outline"
            size="sm"
            disabled={follow}
            title="显示时间戳"
            onClick={() => setTimestamps((t) => !t)}
            className={
              timestamps
                ? 'h-7 border-(--accent) bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-xs text-(--accent-text)'
                : 'h-7 border-(--border-sub) bg-(--bg-surface) text-xs text-(--text-soft)'
            }
          >
            <Clock className="size-3" />
            时间戳
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            title={follow ? '停止跟踪' : '实时跟踪'}
            onClick={() => setFollow((f) => !f)}
            className={`h-7 text-xs ${
              follow
                ? 'border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : 'border-green-500/30 bg-green-500/10 text-green-500 hover:bg-green-500/20'
            }`}
          >
            {follow ? (
              <>
                <Square className="size-3" /> 停止
              </>
            ) : (
              <>
                <Play className="size-3" /> 跟踪
              </>
            )}
          </Button>

          {!follow ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              title="刷新"
              onClick={() => void loadStaticLogs()}
              className="h-7 border-(--border-sub) bg-(--bg-surface) text-(--text-soft)"
            >
              <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            title="复制全部"
            onClick={handleCopy}
            className="h-7 border-(--border-sub) bg-(--bg-surface) text-(--text-soft)"
          >
            {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {lineCount > 0 ? <span className="text-xs text-(--text-muted)">{lineCount} 行</span> : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
              onClick={() => void handleClose()}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {error ? (
          <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-500">
            {error}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1 overflow-hidden p-2" style={{ background: '#0d1117' }}>
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
              <div className="flex items-center gap-2 text-sm text-(--text-soft)">
                <div className="size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                加载中...
              </div>
            </div>
          ) : null}
          <div ref={containerRef} className="size-full" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
