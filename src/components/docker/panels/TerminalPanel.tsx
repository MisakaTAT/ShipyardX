import { useCallback, useEffect, useRef, useState } from 'react'
import debounce from 'lodash-es/debounce'
import { commands } from '@/types/app-bindings'
import { Terminal } from '@xterm/xterm'
import { CanvasAddon } from '@xterm/addon-canvas'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { IDisposable } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { ChevronDown, Loader2, RefreshCw, ShieldAlert, Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const WS_OPEN_RETRIES = 20
const WS_OPEN_RETRY_DELAY_MS = 100
const TERMINAL_RESIZE_DEBOUNCE_MS = 30
const OVERLAY_FADE_OUT_MS = 220
const TERMINAL_VIEW_PADDING_PX = 8
const XTERM_SCROLLBAR_GUTTER_PX = 14
const FIT_HEIGHT_SLACK_PX = 2

const TERMINAL_SURFACE_BG = '#0d1117'

const XTERM_THEME = {
  background: TERMINAL_SURFACE_BG,
  foreground: '#e2e8f0',
  cursor: '#60a5fa',
  cursorAccent: TERMINAL_SURFACE_BG,
  selectionBackground: '#3b82f680',
  black: '#161b22',
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
} as const

type TerminalWireInbound = { type: 'output'; data: number[] } | { type: 'closed' } | { type: 'error'; message: string }

function isU8Payload(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 255)
}

function parseTerminalWireInbound(raw: string): TerminalWireInbound | null {
  try {
    const o = JSON.parse(raw) as { type?: string; data?: unknown; message?: unknown }
    if (o.type === 'closed') return { type: 'closed' }
    if (o.type === 'error' && typeof o.message === 'string') return { type: 'error', message: o.message }
    if (o.type === 'output' && isU8Payload(o.data)) return { type: 'output', data: o.data }
  } catch {
    return null
  }
  return null
}

function terminalSocketUrl(sessionId: string, wsPort: number) {
  return `ws://127.0.0.1:${wsPort}/terminal/${sessionId}`
}

function createWebSocketWhenOpen(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const onFail = () => {
      socket.close()
      reject(new Error('WebSocket 连接失败'))
    }
    socket.onopen = () => {
      socket.onopen = null
      socket.onerror = null
      resolve(socket)
    }
    socket.onerror = onFail
  })
}

async function openTerminalSocket(sessionId: string, wsPort: number): Promise<WebSocket> {
  const url = terminalSocketUrl(sessionId, wsPort)
  let lastError: unknown
  for (let i = 0; i < WS_OPEN_RETRIES; i += 1) {
    try {
      return await createWebSocketWhenOpen(url)
    } catch (e) {
      lastError = e
      await new Promise((r) => setTimeout(r, WS_OPEN_RETRY_DELAY_MS))
    }
  }
  throw lastError ?? new Error('WebSocket 多次重试仍无法连接')
}

function sendTerminalWireJson(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify(payload))
  } catch (e) {
    console.error(e)
  }
}

function closeTerminalSocket(socket: WebSocket) {
  sendTerminalWireJson(socket, { type: 'close' })
  socket.close()
}

function textToUtf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function xtermBinaryPayloadToBytes(data: string): number[] {
  return Array.from(Uint8Array.from(data, (c) => c.charCodeAt(0)))
}

// 用 client 尺寸避免 FitAddon 在 flex 下多算一行

type XtermInternalCore = {
  _renderService: {
    dimensions: { css: { cell: { width: number; height: number } } }
    clear: () => void
  }
}

function getXtermCore(term: Terminal): XtermInternalCore | null {
  return (term as unknown as { _core?: XtermInternalCore })._core ?? null
}

function fitTerminalToContainer(term: Terminal, fitAddon: FitAddon) {
  if (!term.element?.parentElement) {
    fitAddon.fit()
    return
  }
  const core = getXtermCore(term)
  const cell = core?._renderService.dimensions.css.cell
  if (!cell || cell.width === 0 || cell.height === 0) {
    fitAddon.fit()
    return
  }
  const parent = term.element.parentElement
  const cs = window.getComputedStyle(term.element)
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
  const scrollbar = term.options.scrollback === 0 ? 0 : (term.options.overviewRuler?.width ?? XTERM_SCROLLBAR_GUTTER_PX)
  const innerH = Math.max(0, parent.clientHeight - padY - FIT_HEIGHT_SLACK_PX)
  const innerW = Math.max(0, parent.clientWidth - padX - scrollbar)
  const cols = Math.max(2, Math.floor(innerW / cell.width))
  const rows = Math.max(1, Math.floor(innerH / cell.height))
  if (term.cols !== cols || term.rows !== rows) {
    core._renderService.clear()
    term.resize(cols, rows)
  }
}

function isWebGL2Usable(): boolean {
  try {
    const c = document.createElement('canvas')
    return c.getContext('webgl2') != null
  } catch {
    return false
  }
}

/** WebGL2 → Canvas 2D → xterm 内置渲染 */
function mountXtermRenderAddons(term: Terminal): () => void {
  let webgl: WebglAddon | undefined
  let canvas: CanvasAddon | undefined
  let onContextLoss: IDisposable | undefined

  const unloadWebGL = () => {
    onContextLoss?.dispose()
    onContextLoss = undefined
    try {
      webgl?.dispose()
    } catch {
      /* noop */
    }
    webgl = undefined
  }

  const unloadCanvas = () => {
    try {
      canvas?.dispose()
    } catch {
      /* noop */
    }
    canvas = undefined
  }

  const ensureCanvas = () => {
    if (canvas) return
    try {
      canvas = new CanvasAddon()
      term.loadAddon(canvas)
    } catch (e) {
      console.warn('[TerminalPanel] Canvas 渲染不可用，使用内置渲染', e)
    }
  }

  if (isWebGL2Usable()) {
    try {
      webgl = new WebglAddon()
      term.loadAddon(webgl)
      onContextLoss = webgl.onContextLoss(() => {
        unloadWebGL()
        ensureCanvas()
      })
    } catch (e) {
      console.warn('[TerminalPanel] WebGL 初始化失败，使用 Canvas', e)
      unloadWebGL()
      ensureCanvas()
    }
  } else {
    ensureCanvas()
  }

  return () => {
    unloadWebGL()
    unloadCanvas()
  }
}

interface TerminalPanelProps {
  serverId: string
  containerId?: string
  title?: string
  onRequestClose?: () => void
}

type ConnectionPhase = 'disconnected' | 'connecting' | 'connected' | 'error'

type EndSessionOptions = {
  updateUi: boolean
  reason?: 'remote' | 'error'
  errorMessage?: string
}

export default function TerminalPanel({ serverId, containerId, title, onRequestClose }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const backendSessionIdRef = useRef<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const detachSocketMessageRef = useRef<(() => void) | null>(null)
  const xtermInputDisposablesRef = useRef<IDisposable[]>([])
  const overlayFadeTimerRef = useRef<number | null>(null)
  const serverIdLiveRef = useRef(serverId)
  const connectInFlightRef = useRef(false)
  const mountAliveRef = useRef(true)
  const serverEpochRef = useRef(0)
  const shellReadyPendingRef = useRef(false)
  const containerIdLiveRef = useRef<string | undefined>(containerId)
  const [phase, setPhase] = useState<ConnectionPhase>('disconnected')
  const [errorText, setErrorText] = useState('')
  const [wasEverConnected, setWasEverConnected] = useState(false)
  const [errorDetailsExpanded, setErrorDetailsExpanded] = useState(false)
  const [overlayMounted, setOverlayMounted] = useState(true)
  const [execUser, setExecUser] = useState('')
  const [execShellPreset, setExecShellPreset] = useState<'/bin/ash' | '/bin/bash' | '/bin/sh' | 'custom'>('/bin/sh')
  const [execCustomShell, setExecCustomShell] = useState('')

  serverIdLiveRef.current = serverId
  containerIdLiveRef.current = containerId

  useEffect(() => {
    if (phase === 'error') setErrorDetailsExpanded(false)
  }, [phase, errorText])

  useEffect(() => {
    serverEpochRef.current += 1
    setPhase('disconnected')
    setErrorText('')
    setWasEverConnected(false)
    setOverlayMounted(true)
  }, [serverId, containerId])

  useEffect(() => {
    if (overlayFadeTimerRef.current !== null) {
      window.clearTimeout(overlayFadeTimerRef.current)
      overlayFadeTimerRef.current = null
    }
    if (phase === 'connected') {
      overlayFadeTimerRef.current = window.setTimeout(() => {
        setOverlayMounted(false)
        overlayFadeTimerRef.current = null
      }, OVERLAY_FADE_OUT_MS)
      return
    }
    setOverlayMounted(true)
  }, [phase])

  const disposeXtermWireListeners = useCallback(() => {
    detachSocketMessageRef.current?.()
    detachSocketMessageRef.current = null
    for (const d of xtermInputDisposablesRef.current) d.dispose()
    xtermInputDisposablesRef.current = []
  }, [])

  const endSession = useCallback(
    (opts: EndSessionOptions) => {
      shellReadyPendingRef.current = false
      const socket = socketRef.current
      socketRef.current = null
      disposeXtermWireListeners()

      const sid = backendSessionIdRef.current
      backendSessionIdRef.current = null

      if (socket) closeTerminalSocket(socket)
      if (sid) void commands.closeTerminal(sid).catch(console.error)

      const term = xtermRef.current
      if (term) term.options.disableStdin = true

      if (opts.updateUi && mountAliveRef.current) {
        if (opts.reason === 'error' && opts.errorMessage !== undefined) {
          setPhase('error')
          setErrorText(opts.errorMessage)
          setWasEverConnected(true)
        } else {
          setPhase('disconnected')
          if (opts.reason === 'remote') setWasEverConnected(true)
        }
      }
    },
    [disposeXtermWireListeners],
  )

  const scheduleFitAndFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const term = xtermRef.current
      const fit = fitAddonRef.current
      if (term && fit) fitTerminalToContainer(term, fit)
      xtermRef.current?.focus()
    })
  }, [])

  const connect = useCallback(async () => {
    const term = xtermRef.current
    if (!term || connectInFlightRef.current || socketRef.current) return

    connectInFlightRef.current = true
    setPhase('connecting')
    setErrorText('')

    const epochAtStart = serverEpochRef.current
    const isStale = () => epochAtStart !== serverEpochRef.current
    let openedBackendSessionId: string | null = null

    try {
      term.options.disableStdin = false
      term.clear()
      requestAnimationFrame(() => {
        const t = xtermRef.current
        const f = fitAddonRef.current
        if (t && f) fitTerminalToContainer(t, f)
      })

      const targetContainerId = containerIdLiveRef.current
      const targetShell = execShellPreset === 'custom' ? execCustomShell.trim() : execShellPreset
      const session = targetContainerId
        ? await commands.openContainerExecTerminal(serverIdLiveRef.current, {
            container_id: targetContainerId,
            user: execUser.trim() || null,
            shell: targetShell || '/bin/sh',
            cols: term.cols,
            rows: term.rows,
          })
        : await commands.openTerminal(serverIdLiveRef.current, term.cols, term.rows)
      if (isStale()) {
        void commands.closeTerminal(session.session_id).catch(console.error)
        term.options.disableStdin = true
        return
      }
      openedBackendSessionId = session.session_id
      backendSessionIdRef.current = session.session_id

      const socket = await openTerminalSocket(session.session_id, session.ws_port)
      if (isStale()) {
        void commands.closeTerminal(session.session_id).catch(console.error)
        socket.close()
        backendSessionIdRef.current = null
        openedBackendSessionId = null
        term.options.disableStdin = true
        return
      }

      socketRef.current = socket
      sendTerminalWireJson(socket, { type: 'resize', cols: term.cols, rows: term.rows })

      const onSocketMessage = (ev: MessageEvent) => {
        if (typeof ev.data !== 'string') return
        const inbound = parseTerminalWireInbound(ev.data)
        if (!inbound) return

        if (inbound.type === 'output') {
          if (shellReadyPendingRef.current) {
            shellReadyPendingRef.current = false
            if (mountAliveRef.current) {
              setPhase('connected')
              setWasEverConnected(true)
            }
            scheduleFitAndFocus()
          }
          term.write(new Uint8Array(inbound.data))
          return
        }
        if (inbound.type === 'error') {
          shellReadyPendingRef.current = false
          endSession({ updateUi: true, reason: 'error', errorMessage: inbound.message })
          return
        }
        shellReadyPendingRef.current = false
        endSession({ updateUi: true, reason: 'remote' })
      }

      socket.addEventListener('message', onSocketMessage)
      detachSocketMessageRef.current = () => socket.removeEventListener('message', onSocketMessage)

      const forwardStdin = (bytes: number[]) => {
        const s = socketRef.current
        if (s) sendTerminalWireJson(s, { type: 'input', data: bytes })
      }

      xtermInputDisposablesRef.current.push(
        term.onData((data) => forwardStdin(textToUtf8Bytes(data))),
        term.onBinary((data) => forwardStdin(xtermBinaryPayloadToBytes(data))),
        term.onResize(({ cols, rows }) => {
          const s = socketRef.current
          if (s) sendTerminalWireJson(s, { type: 'resize', cols, rows })
        }),
      )

      if (!mountAliveRef.current || isStale()) {
        endSession({ updateUi: false })
        return
      }

      shellReadyPendingRef.current = true
    } catch (e) {
      disposeXtermWireListeners()
      const orphan = socketRef.current
      backendSessionIdRef.current = null
      socketRef.current = null
      if (orphan) {
        try {
          orphan.close()
        } catch {
          /* noop */
        }
      }
      if (openedBackendSessionId) {
        void commands.closeTerminal(openedBackendSessionId).catch(console.error)
      }
      term.options.disableStdin = true
      if (mountAliveRef.current && epochAtStart === serverEpochRef.current) {
        setPhase('error')
        setErrorText(String(e))
      }
    } finally {
      connectInFlightRef.current = false
    }
  }, [disposeXtermWireListeners, endSession, scheduleFitAndFocus, execCustomShell, execShellPreset, execUser])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    mountAliveRef.current = true

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      theme: XTERM_THEME,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      scrollback: 5000,
      disableStdin: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(el)

    const unmountRenderAddons = mountXtermRenderAddons(term)

    requestAnimationFrame(() => fitTerminalToContainer(term, fitAddon))
    fitAddonRef.current = fitAddon
    xtermRef.current = term

    const debouncedResize = debounce(() => {
      const t = xtermRef.current
      const f = fitAddonRef.current
      if (t && f) fitTerminalToContainer(t, f)
    }, TERMINAL_RESIZE_DEBOUNCE_MS)

    const ro = new ResizeObserver(() => debouncedResize())
    ro.observe(el)

    return () => {
      mountAliveRef.current = false
      shellReadyPendingRef.current = false
      ro.disconnect()
      debouncedResize.cancel()
      if (overlayFadeTimerRef.current !== null) {
        window.clearTimeout(overlayFadeTimerRef.current)
        overlayFadeTimerRef.current = null
      }

      const socket = socketRef.current
      socketRef.current = null
      detachSocketMessageRef.current?.()
      detachSocketMessageRef.current = null
      for (const d of xtermInputDisposablesRef.current) d.dispose()
      xtermInputDisposablesRef.current = []

      const sid = backendSessionIdRef.current
      backendSessionIdRef.current = null
      if (sid) {
        if (socket) closeTerminalSocket(socket)
        void commands.closeTerminal(sid).catch(console.error)
      }

      xtermRef.current = null
      fitAddonRef.current = null
      unmountRenderAddons()
      term.dispose()
    }
  }, [serverId, containerId])

  const overlayVisible = phase !== 'connected'
  const xtermVisible = phase === 'connected'
  const isContainerExec = Boolean(containerId)

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-panel)' }}>
      {title ? (
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2"
          style={{ borderColor: 'var(--border-sub)' }}
        >
          <div className="flex min-w-0 items-center gap-2 text-xs" style={{ color: 'var(--text-soft)' }}>
            <TerminalIcon className="shrink-0" />
            <span className="truncate">{title}</span>
          </div>
          <div className="flex items-center gap-1">
            {onRequestClose ? (
              <Button
                type="button"
                variant="ghost"
                icon
                className="text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
                onClick={onRequestClose}
                title="关闭"
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={containerRef}
          className="h-full w-full box-border"
          style={{
            padding: TERMINAL_VIEW_PADDING_PX,
            background: TERMINAL_SURFACE_BG,
            visibility: xtermVisible ? 'visible' : 'hidden',
          }}
        />

        {overlayMounted && (
          <div
            className={cn(
              'absolute inset-0 z-10 flex flex-1 items-center justify-center p-6 transition-all duration-200',
              overlayVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0',
            )}
            style={{ background: 'var(--bg-panel)' }}
          >
            <div className="mx-auto w-full max-w-lg space-y-6 text-center">
              {phase === 'disconnected' && (
                <>
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-(--accent)/10">
                      <TerminalIcon className="size-7 text-(--accent-text)" />
                    </div>
                    <h2 className="text-lg font-semibold text-(--text-strong)">
                      {wasEverConnected ? '连接已断开' : '远程终端未连接'}
                    </h2>
                    <p className="text-sm text-(--text-soft)">
                      {wasEverConnected
                        ? '与远程主机的会话已结束，可重新建立连接。'
                        : isContainerExec
                          ? '将通过 SSH 在远程主机上执行 docker exec 并接入容器交互终端。'
                          : '通过 SSH 登录当前服务器，连接后即可在此输入命令。'}
                    </p>
                  </div>
                  {isContainerExec && (
                    <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-(--bg-surface) p-3 text-left">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <p className="text-xs text-(--text-muted)">用户（可选）</p>
                          <Input
                            value={execUser}
                            onChange={(e) => setExecUser(e.target.value)}
                            placeholder="root 或 1000:1000"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs text-(--text-muted)">Shell</p>
                          <Select
                            value={execShellPreset}
                            onValueChange={(v) => setExecShellPreset(v as typeof execShellPreset)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="/bin/ash">/bin/ash</SelectItem>
                              <SelectItem value="/bin/bash">/bin/bash</SelectItem>
                              <SelectItem value="/bin/sh">/bin/sh</SelectItem>
                              <SelectItem value="custom">自定义</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {execShellPreset === 'custom' ? (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-xs text-(--text-muted)">自定义 shell 命令</p>
                          <Input
                            value={execCustomShell}
                            onChange={(e) => setExecCustomShell(e.target.value)}
                            placeholder="示例 /busybox/sh"
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      type="button"
                      onClick={connect}
                      disabled={isContainerExec && execShellPreset === 'custom' && !execCustomShell.trim()}
                    >
                      <TerminalIcon />
                      {wasEverConnected ? '重新连接' : '开始连接'}
                    </Button>
                  </div>
                </>
              )}

              {phase === 'connecting' && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-(--accent)/10">
                    <Loader2 className="size-7 animate-spin text-(--accent-text)" />
                  </div>
                  <h2 className="text-lg font-semibold text-(--text-strong)">正在连接</h2>
                  <p className="text-sm text-(--text-soft)">
                    {isContainerExec
                      ? '正在通过 SSH 启动 docker exec 并连接容器终端，请稍候。'
                      : '正在通过 SSH 登录远程主机并启动终端，请稍候。'}
                  </p>
                </div>
              )}

              {phase === 'error' && (
                <>
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10">
                      <ShieldAlert className="size-7 text-amber-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-(--text-strong)">无法建立 SSH 连接</h2>
                    <p className="text-sm text-(--text-soft)">
                      请检查网络是否可达，并确认地址、端口、用户名及密钥或密码是否正确。
                    </p>
                  </div>

                  <div className="flex w-full flex-col items-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-(--text-muted) transition-colors hover:text-(--text-base)"
                      onClick={() => setErrorDetailsExpanded((v) => !v)}
                      aria-expanded={errorDetailsExpanded}
                    >
                      查看详情
                      <ChevronDown
                        className={cn('transition-transform duration-200', errorDetailsExpanded && 'rotate-180')}
                      />
                    </button>
                    {errorDetailsExpanded ? (
                      <pre className="mt-3 max-h-36 w-full overflow-y-auto text-center font-mono text-[11px] leading-relaxed text-(--text-soft) wrap-break-word whitespace-pre-wrap">
                        {errorText}
                      </pre>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPhase('disconnected')
                        setErrorText('')
                      }}
                    >
                      返回
                    </Button>
                    <Button type="button" onClick={connect}>
                      <RefreshCw />
                      重试
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
