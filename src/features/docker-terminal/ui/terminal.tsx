import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal as WTerminal, WebSocketTransport, useTerminal } from '@wterm/react'
import '@wterm/react/css'
import { ChevronDown, Loader2, RefreshCw, ShieldAlert, Terminal as TerminalIcon } from 'lucide-react'
import { commands } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { getErrorMessage, normalizeAppError, type AppErrorLike } from '@/shared/lib/errors'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { cn } from '@/shared/lib/utils'

const WS_OPEN_RETRIES = 20
const WS_OPEN_RETRY_DELAY_MS = 100
const OVERLAY_FADE_OUT_MS = 220
const TERMINAL_VIEW_PADDING_PX = 8
const TERMINAL_SURFACE_BG = '#1e1e1e'
const DEFAULT_ROW_HEIGHT_PX = 17

/**
 * 覆盖 @wterm/dom 默认 .wterm 样式里的 padding / border-radius / box-shadow，
 * 并强制 border-box + 100% 宽度。高度由 JS 按 row-height 整数倍对齐（见下方 ResizeObserver）
 * 以规避 wterm `_scrollToBottom` 里 `floor(maxScroll / rh) * rh` 的 snap 截掉最后一行的问题。
 */
const TERMINAL_STYLE = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 0,
  borderRadius: 0,
  boxShadow: 'none',
  scrollbarGutter: 'stable',
} as const

/**
 * 终端 WebSocket 协议（单路二进制 + 首字节 channel tag）：
 *   tag 0x00 + payload = PTY 字节流（双向）
 *   tag 0x01 + payload = 控制 JSON（UTF-8，双向）
 *     下行：{ type: 'closed' } | { type: 'error', error }
 *     上行：{ type: 'resize', cols, rows } | { type: 'close' }
 */
const TAG_DATA = 0x00
const TAG_CTRL = 0x01

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function ptyFrame(data: string): Uint8Array {
  const payload = textEncoder.encode(data)
  const out = new Uint8Array(1 + payload.length)
  out[0] = TAG_DATA
  out.set(payload, 1)
  return out
}

function ctrlFrame(payload: Record<string, unknown>): Uint8Array {
  const json = textEncoder.encode(JSON.stringify(payload))
  const out = new Uint8Array(1 + json.length)
  out[0] = TAG_CTRL
  out.set(json, 1)
  return out
}

type ControlInbound = { type: 'closed' } | { type: 'error'; error: AppErrorLike }

function parseControlInbound(bytes: Uint8Array): ControlInbound | null {
  try {
    const o = JSON.parse(textDecoder.decode(bytes)) as { type?: string; error?: unknown }
    if (o.type === 'closed') return { type: 'closed' }
    if (o.type === 'error' && o.error) return { type: 'error', error: normalizeAppError(o.error) }
  } catch {
    return null
  }
  return null
}

function terminalSocketUrl(sessionId: string, wsPort: number) {
  return `ws://127.0.0.1:${wsPort}/terminal/${sessionId}`
}

type TransportCallbacks = {
  onPty: (bytes: Uint8Array) => void
  onControl: (msg: ControlInbound) => void
  onClose: () => void
}

function connectTerminalTransport(url: string, cb: TransportCallbacks): Promise<WebSocketTransport> {
  return new Promise((resolve, reject) => {
    let settled = false
    const transport = new WebSocketTransport({
      reconnect: false,
      onData: (data) => {
        if (!(data instanceof Uint8Array) || data.length === 0) return
        const tag = data[0]
        const body = data.subarray(1)
        if (tag === TAG_DATA) cb.onPty(body)
        else if (tag === TAG_CTRL) {
          const msg = parseControlInbound(body)
          if (msg) cb.onControl(msg)
        }
      },
      onOpen: () => {
        settled = true
        resolve(transport)
      },
      onClose: () => {
        if (settled) cb.onClose()
      },
      onError: () => {
        if (!settled) reject(new Error('WebSocket 连接失败'))
      },
    })
    transport.connect(url)
  })
}

async function openTerminalTransport(
  sessionId: string,
  wsPort: number,
  cb: TransportCallbacks
): Promise<WebSocketTransport> {
  const url = terminalSocketUrl(sessionId, wsPort)
  let lastError: unknown
  for (let i = 0; i < WS_OPEN_RETRIES; i += 1) {
    try {
      return await connectTerminalTransport(url, cb)
    } catch (e) {
      lastError = e
      await new Promise((r) => setTimeout(r, WS_OPEN_RETRY_DELAY_MS))
    }
  }
  throw lastError ?? new Error('WebSocket 多次重试仍无法连接')
}

function closeTerminalTransport(transport: WebSocketTransport) {
  if (transport.connected) transport.send(ctrlFrame({ type: 'close' }))
  transport.close()
}

interface TerminalProps {
  serverId: string
  containerId?: string
}

type ConnectionPhase = 'disconnected' | 'connecting' | 'connected' | 'error'

type EndSessionOptions = {
  updateUi: boolean
  reason?: 'remote' | 'error'
  errorMessage?: string
}

export default function Terminal({ serverId, containerId }: TerminalProps) {
  const { ref: termRef, write: termWrite, focus: termFocus } = useTerminal()
  const sizeRef = useRef({ cols: 80, rows: 24 })
  const backendSessionIdRef = useRef<string | null>(null)
  const transportRef = useRef<WebSocketTransport | null>(null)
  const overlayFadeTimerRef = useRef<number | null>(null)
  const terminalHostRef = useRef<HTMLDivElement | null>(null)
  const serverIdLiveRef = useRef(serverId)
  const containerIdLiveRef = useRef<string | undefined>(containerId)
  const connectInFlightRef = useRef(false)
  const mountAliveRef = useRef(true)
  const serverEpochRef = useRef(0)
  const shellReadyPendingRef = useRef(false)
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

  /**
   * 把 .wterm 的可视高度对齐到 rowHeight 的整数倍。wterm 内部 _scrollToBottom 会把
   * scrollTop snap 到 floor(maxScroll / rh) * rh，若 maxScroll 不是 rh 倍数，最后一行会被切掉。
   */
  const alignTerminalHeight = useCallback(() => {
    const host = terminalHostRef.current
    const wt = host?.querySelector<HTMLElement>('.wterm')
    if (!host || !wt) return
    const rh = Number.parseFloat(getComputedStyle(wt).getPropertyValue('--term-row-height')) || DEFAULT_ROW_HEIGHT_PX
    if (rh <= 0) return
    const cs = getComputedStyle(host)
    const availH = host.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
    wt.style.height = `${Math.max(rh, Math.floor(availH / rh) * rh)}px`
  }, [])

  useEffect(() => {
    const host = terminalHostRef.current
    if (!host) return
    const ro = new ResizeObserver(() => alignTerminalHeight())
    ro.observe(host)
    const rafId = requestAnimationFrame(alignTerminalHeight)
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [alignTerminalHeight])

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

  const endSession = useCallback((opts: EndSessionOptions) => {
    shellReadyPendingRef.current = false
    const transport = transportRef.current
    transportRef.current = null

    const sid = backendSessionIdRef.current
    backendSessionIdRef.current = null

    if (transport) closeTerminalTransport(transport)
    if (sid) void commands.closeTerminal(sid).catch(console.error)

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
  }, [])

  useEffect(() => {
    mountAliveRef.current = true
    return () => {
      mountAliveRef.current = false
      shellReadyPendingRef.current = false
      if (overlayFadeTimerRef.current !== null) {
        window.clearTimeout(overlayFadeTimerRef.current)
        overlayFadeTimerRef.current = null
      }

      const transport = transportRef.current
      transportRef.current = null

      const sid = backendSessionIdRef.current
      backendSessionIdRef.current = null
      if (sid) {
        if (transport) closeTerminalTransport(transport)
        void commands.closeTerminal(sid).catch(console.error)
      }
    }
  }, [])

  const connect = useCallback(async () => {
    if (connectInFlightRef.current || transportRef.current) return

    connectInFlightRef.current = true
    setPhase('connecting')
    setErrorText('')

    const epochAtStart = serverEpochRef.current
    const isStale = () => epochAtStart !== serverEpochRef.current
    let openedBackendSessionId: string | null = null

    try {
      // 重置残留内容：RIS + 清除回滚缓冲
      termWrite('\x1bc\x1b[3J')

      const { cols, rows } = sizeRef.current
      const targetContainerId = containerIdLiveRef.current
      const targetShell = execShellPreset === 'custom' ? execCustomShell.trim() : execShellPreset
      const session = targetContainerId
        ? await commands.openContainerExecTerminal(serverIdLiveRef.current, {
            container_id: targetContainerId,
            user: execUser.trim() || null,
            shell: targetShell || '/bin/sh',
            cols,
            rows,
          })
        : await commands.openTerminal(serverIdLiveRef.current, cols, rows)
      if (isStale()) {
        void commands.closeTerminal(session.session_id).catch(console.error)
        return
      }
      openedBackendSessionId = session.session_id
      backendSessionIdRef.current = session.session_id

      const transport = await openTerminalTransport(session.session_id, session.ws_port, {
        onPty: (bytes) => {
          if (shellReadyPendingRef.current) {
            shellReadyPendingRef.current = false
            if (mountAliveRef.current) {
              setPhase('connected')
              setWasEverConnected(true)
            }
            requestAnimationFrame(() => termFocus())
          }
          termWrite(bytes)
        },
        onControl: (msg) => {
          shellReadyPendingRef.current = false
          if (msg.type === 'error') {
            endSession({ updateUi: true, reason: 'error', errorMessage: msg.error.message })
          } else {
            endSession({ updateUi: true, reason: 'remote' })
          }
        },
        onClose: () => {
          // 服务端或网络层断开；若我们已自行清理，transportRef 会先被置空并直接忽略
          if (transportRef.current) endSession({ updateUi: true, reason: 'remote' })
        },
      })
      if (isStale()) {
        transport.close()
        void commands.closeTerminal(session.session_id).catch(console.error)
        backendSessionIdRef.current = null
        openedBackendSessionId = null
        return
      }

      transportRef.current = transport
      transport.send(ctrlFrame({ type: 'resize', cols, rows }))

      if (!mountAliveRef.current || isStale()) {
        endSession({ updateUi: false })
        return
      }

      shellReadyPendingRef.current = true
    } catch (e) {
      const orphan = transportRef.current
      backendSessionIdRef.current = null
      transportRef.current = null
      if (orphan) orphan.close()
      if (openedBackendSessionId) {
        void commands.closeTerminal(openedBackendSessionId).catch(console.error)
      }
      if (mountAliveRef.current && epochAtStart === serverEpochRef.current) {
        setPhase('error')
        setErrorText(getErrorMessage(e))
      }
    } finally {
      connectInFlightRef.current = false
    }
  }, [endSession, termFocus, termWrite, execCustomShell, execShellPreset, execUser])

  const handleTerminalData = useCallback((data: string) => {
    const transport = transportRef.current
    if (transport?.connected) transport.send(ptyFrame(data))
  }, [])

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    sizeRef.current = { cols, rows }
    const transport = transportRef.current
    if (transport?.connected) transport.send(ctrlFrame({ type: 'resize', cols, rows }))
  }, [])

  const overlayVisible = phase !== 'connected'
  const terminalVisible = phase === 'connected'
  const isContainerExec = Boolean(containerId)

  return (
    <div className="relative h-full w-full overflow-hidden select-text" style={{ background: TERMINAL_SURFACE_BG }}>
      <div
        ref={terminalHostRef}
        className="absolute inset-0 box-border"
        style={{
          padding: TERMINAL_VIEW_PADDING_PX,
          visibility: terminalVisible ? 'visible' : 'hidden',
        }}
      >
        <WTerminal
          ref={termRef}
          autoResize
          cursorBlink
          theme="default"
          onData={handleTerminalData}
          onResize={handleTerminalResize}
          onReady={() => {
            requestAnimationFrame(alignTerminalHeight)
          }}
          style={TERMINAL_STYLE}
        />
      </div>

      {overlayMounted && (
        <div
          className={cn(
            'absolute inset-0 z-10 flex flex-1 items-center justify-center bg-card p-6 transition-all duration-200',
            overlayVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
          )}
        >
          <div className="mx-auto w-full max-w-lg space-y-6 text-center">
            {phase === 'disconnected' && (
              <>
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                    <TerminalIcon className="size-7 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {wasEverConnected ? '连接已断开' : '远程终端未连接'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {wasEverConnected
                      ? '与远程主机的会话已结束，可重新建立连接。'
                      : isContainerExec
                        ? '将通过 Docker API 创建 exec 会话并接入容器交互终端。'
                        : '通过 SSH 登录当前服务器，连接后即可在此输入命令。'}
                  </p>
                </div>
                {isContainerExec && (
                  <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-muted p-3 text-left">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">用户（可选）</p>
                        <Input
                          value={execUser}
                          onChange={(e) => setExecUser(e.target.value)}
                          placeholder="root 或 1000:1000"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Shell</p>
                        <Select
                          value={execShellPreset}
                          onValueChange={(v) => setExecShellPreset(v as typeof execShellPreset)}
                        >
                          <SelectTrigger className="w-full">
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
                        <p className="text-xs text-muted-foreground">自定义 shell 命令</p>
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
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Loader2 className="size-7 animate-spin text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">正在连接</h2>
                <p className="text-sm text-muted-foreground">
                  {isContainerExec
                    ? '正在通过 Docker API 启动容器终端，请稍候。'
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
                  <h2 className="text-lg font-semibold text-foreground">
                    {isContainerExec ? '无法连接容器终端' : '无法建立 SSH 连接'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isContainerExec
                      ? '请确认容器仍在运行，并检查当前连接是否有 Docker API 访问权限。'
                      : '请检查网络是否可达，并确认地址、端口、用户名及密钥或密码是否正确。'}
                  </p>
                </div>

                <div className="flex w-full flex-col items-center">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setErrorDetailsExpanded((v) => !v)}
                    aria-expanded={errorDetailsExpanded}
                  >
                    查看详情
                    <ChevronDown
                      className={cn('transition-transform duration-200', errorDetailsExpanded && 'rotate-180')}
                    />
                  </button>
                  {errorDetailsExpanded ? (
                    <pre className="mt-3 max-h-36 w-full overflow-y-auto text-center text-[12px] leading-relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground">
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
  )
}
