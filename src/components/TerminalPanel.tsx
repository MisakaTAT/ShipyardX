import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import WebSocket from '@tauri-apps/plugin-websocket'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Loader2, TerminalIcon } from 'lucide-react'
import type { TerminalSession } from '../types'

interface TerminalPanelProps {
  serverId: string
  serverName: string
}

type Status = 'connecting' | 'connected' | 'closed' | 'error'
type ServerMsg = { type: 'output'; data: number[] } | { type: 'closed' }

function extractTextPayload(msg: unknown): string | null {
  if (typeof msg === 'string') return msg
  if (msg && typeof msg === 'object') {
    const obj = msg as Record<string, unknown>
    if (typeof obj.data === 'string' && (obj.type === 'Text' || obj.type === 'text')) {
      return obj.data
    }
    if (typeof obj.Text === 'string') {
      return obj.Text
    }
  }
  return null
}

function parseWsPayload(msg: unknown): ServerMsg | null {
  const text = extractTextPayload(msg)
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as { type?: string; data?: unknown }
    if (parsed.type === 'closed') return { type: 'closed' }
    if (parsed.type === 'output' && Array.isArray(parsed.data)) {
      return { type: 'output', data: parsed.data as number[] }
    }
  } catch {
    return null
  }
  return null
}

async function connectTerminalWs(sessionId: string, wsPort: number) {
  const url = `ws://127.0.0.1:${wsPort}/terminal/${sessionId}`
  let lastErr: unknown = null
  for (let i = 0; i < 20; i += 1) {
    try {
      return await WebSocket.connect(url)
    } catch (e) {
      lastErr = e
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw lastErr ?? new Error('websocket connect failed')
}

const XTERM_THEME = {
  background: '#0f172a',
  foreground: '#e2e8f0',
  cursor: '#60a5fa',
  cursorAccent: '#0f172a',
  selectionBackground: '#3b82f680',
  black: '#1e293b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#34d399',
  white: '#e2e8f0',
  brightBlack: '#475569',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#6ee7b7',
  brightWhite: '#f8fafc',
}

export default function TerminalPanel({ serverId, serverName }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const wsRef = useRef<Awaited<ReturnType<typeof WebSocket.connect>> | null>(null)
  const removeWsListenerRef = useRef<(() => void) | null>(null)
  const resizeTimerRef = useRef<number | null>(null)
  const [status, setStatus] = useState<Status>('connecting')

  const syncResizeToBackend = (term: Terminal) => {
    const ws = wsRef.current
    if (!ws) return
    void ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })).catch(() => {})
  }

  useEffect(() => {
    if (!containerRef.current) return

    // 初始化 xterm.js
    const term = new Terminal({
      fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      theme: XTERM_THEME,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    // 延迟 fit 确保容器已渲染
    requestAnimationFrame(() => fitAddon.fit())

    fitAddonRef.current = fitAddon

    const { cols, rows } = term

    // 打开 SSH 终端会话
    invoke<TerminalSession>('open_terminal', { server_id: serverId, cols, rows })
      .then(async ({ session_id, ws_port }) => {
        sessionIdRef.current = session_id
        const ws = await connectTerminalWs(session_id, ws_port)
        wsRef.current = ws
        setStatus('connected')
        // 连接建立后主动同步一次尺寸，避免如 top/vim 首屏拿到旧 PTY 尺寸
        syncResizeToBackend(term)

        const removeListener = ws.addListener((msg) => {
          const parsed = parseWsPayload(msg)
          if (!parsed) return
          if (parsed.type === 'output') {
            term.write(new Uint8Array(parsed.data))
          } else if (parsed.type === 'closed') {
            setStatus('closed')
            term.writeln('\r\n\x1b[33m[ 连接已关闭 ]\x1b[0m')
            term.options.disableStdin = true
          }
        })
        removeWsListenerRef.current = removeListener

        // 将键盘输入发送到 SSH
        term.onData((data) => {
          const bytes = Array.from(new TextEncoder().encode(data))
          void ws.send(JSON.stringify({ type: 'input', data: bytes })).catch(console.error)
        })

        // 二进制输入（如粘贴）
        term.onBinary((data) => {
          const bytes = Array.from(Uint8Array.from(data, (c) => c.charCodeAt(0)))
          void ws.send(JSON.stringify({ type: 'input', data: bytes })).catch(console.error)
        })

        // 同步终端尺寸变化
        term.onResize(({ cols, rows }) => {
          void ws.send(JSON.stringify({ type: 'resize', cols, rows })).catch(console.error)
        })
      })
      .catch((e) => {
        setStatus('error')
        term.writeln(`\x1b[31m连接失败: ${String(e)}\x1b[0m`)
      })

    // 响应窗口尺寸变化
    const handleResize = () => {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = window.setTimeout(() => {
        fitAddonRef.current?.fit()
        syncResizeToBackend(term)
      }, 30)
    }
    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
      const ws = wsRef.current
      wsRef.current = null
      removeWsListenerRef.current?.()
      removeWsListenerRef.current = null

      const sessionId = sessionIdRef.current
      if (sessionId) {
        void ws?.send(JSON.stringify({ type: 'close' })).catch(() => {})
        void ws?.disconnect().catch(() => {})
        invoke('close_terminal', { session_id: sessionId }).catch(console.error)
        sessionIdRef.current = null
      }
      term.dispose()
    }
  }, [serverId])

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d1117' }}>
      {/* 状态栏 */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2"
        style={{ background: 'var(--bg-panel)' }}
      >
        <TerminalIcon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {serverName}
        </span>
        <span style={{ color: 'var(--border-sub)' }}>·</span>
        <StatusBadge status={status} />
      </div>

      {/* 终端容器（始终暗色背景） */}
      <div className="flex-1 relative overflow-hidden" style={{ background: '#0d1117' }}>
        {status === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              正在建立 SSH 连接...
            </span>
          </div>
        )}
        {/* xterm.js 挂载点 */}
        <div ref={containerRef} className="h-full w-full" style={{ padding: '8px' }} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const configs: Record<Status, { color: string; text: string; dot?: boolean }> = {
    connecting: { color: 'text-yellow-500', text: '连接中...', dot: true },
    connected: { color: 'text-green-400', text: '已连接', dot: true },
    closed: { color: 'text-slate-500', text: '已断开' },
    error: { color: 'text-red-400', text: '连接失败' },
  }

  const cfg = configs[status]
  return (
    <span className={`flex items-center gap-1 text-xs ${cfg.color}`}>
      {cfg.dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            status === 'connected'
              ? 'bg-green-400 animate-pulse'
              : status === 'connecting'
                ? 'bg-yellow-500 animate-pulse'
                : 'bg-slate-500'
          }`}
        />
      )}
      {cfg.text}
    </span>
  )
}
