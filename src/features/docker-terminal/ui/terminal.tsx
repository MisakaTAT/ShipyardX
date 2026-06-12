import { useCallback, useEffect, useRef, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { CanvasAddon } from '@xterm/addon-canvas'
import { FitAddon } from '@xterm/addon-fit'
import { ImageAddon } from '@xterm/addon-image'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {
  ChevronDown,
  Download,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react'
import { useAppSettings } from '@/app/settings-store'
import { XTERM_THEME_MAP } from '@/themes/xtermjs'
import { commands } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { getErrorMessage, normalizeAppError, type AppErrorLike } from '@/shared/lib/errors'
import { Input } from '@/shared/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { cn } from '@/shared/lib/utils'

const WS_OPEN_RETRIES = 20
const WS_OPEN_RETRY_DELAY_MS = 100
const OVERLAY_FADE_OUT_MS = 220
const BACKEND_RESIZE_THROTTLE_MS = 120
const TERMINAL_VIEW_PADDING_PX = 8
const TERMINAL_SURFACE_BG = '#1e1e1e'

/**
 * 终端 WebSocket 协议（单路二进制 + 首字节 channel tag）：
 *   tag 0x00 + payload = PTY 字节流（双向）
 *   tag 0x01 + payload = 控制 JSON（UTF-8，双向）
 *     下行：{ type: 'ready' } | { type: 'closed' } | { type: 'error', error }
 *     上行：{ type: 'client_ready' } | { type: 'resize', cols, rows } | { type: 'close' }
 */
const TAG_DATA = 0x00
const TAG_CTRL = 0x01

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function ptyFrame(data: string): ArrayBuffer {
  const payload = textEncoder.encode(data)
  const out = new Uint8Array(new ArrayBuffer(1 + payload.length))
  out[0] = TAG_DATA
  out.set(payload, 1)
  return out.buffer
}

function ctrlFrame(payload: Record<string, unknown>): ArrayBuffer {
  const json = textEncoder.encode(JSON.stringify(payload))
  const out = new Uint8Array(new ArrayBuffer(1 + json.length))
  out[0] = TAG_CTRL
  out.set(json, 1)
  return out.buffer
}

type ControlInbound = { type: 'ready' } | { type: 'closed' } | { type: 'error'; error: AppErrorLike }

function parseControlInbound(bytes: Uint8Array): ControlInbound | null {
  try {
    const o = JSON.parse(textDecoder.decode(bytes)) as { type?: string; error?: unknown }
    if (o.type === 'ready') return { type: 'ready' }
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

function connectTerminalTransport(url: string, cb: TransportCallbacks): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false
    const transport = new WebSocket(url)
    transport.binaryType = 'arraybuffer'
    transport.onmessage = (event) => {
      const data =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : event.data instanceof Blob
            ? null
            : event.data instanceof Uint8Array
              ? event.data
              : null
      if (!data || data.length === 0) return
      const tag = data[0]
      const body = data.subarray(1)
      if (tag === TAG_DATA) cb.onPty(body)
      else if (tag === TAG_CTRL) {
        const msg = parseControlInbound(body)
        if (msg) cb.onControl(msg)
      }
    }
    transport.onopen = () => {
      transport.send(ctrlFrame({ type: 'client_ready' }))
      settled = true
      resolve(transport)
    }
    transport.onclose = () => {
      if (settled) cb.onClose()
    }
    transport.onerror = () => {
      if (!settled) reject(new Error('WebSocket 连接失败'))
    }
  })
}

async function openTerminalTransport(sessionId: string, wsPort: number, cb: TransportCallbacks): Promise<WebSocket> {
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

function closeTerminalTransport(transport: WebSocket) {
  if (transport.readyState === WebSocket.OPEN) transport.send(ctrlFrame({ type: 'close' }))
  transport.close()
}

function attachRendererAddon(terminal: XTerm, frontend: 'xterm-canvas' | 'xterm-webgl') {
  if (frontend === 'xterm-webgl') {
    try {
      const webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
      return webglAddon
    } catch {
      try {
        const canvasAddon = new CanvasAddon()
        terminal.loadAddon(canvasAddon)
        return canvasAddon
      } catch {
        return null
      }
    }
  }

  try {
    const canvasAddon = new CanvasAddon()
    terminal.loadAddon(canvasAddon)
    return canvasAddon
  } catch {
    return null
  }
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
  const {
    settings: {
      terminal: {
        frontend: terminalFrontend,
        theme: terminalThemeName,
        scrollback,
        ligatures,
        fontFamily,
        fontSize,
        cursorStyle,
        cursorBlink,
        lineHeight,
      },
    },
  } = useAppSettings()
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const fitFrameRef = useRef<number | null>(null)
  const sizeRef = useRef({ cols: 80, rows: 24 })
  const backendSentSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const pendingBackendSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const backendResizeTimerRef = useRef<number | null>(null)
  const backendSessionIdRef = useRef<string | null>(null)
  const transportRef = useRef<WebSocket | null>(null)
  const overlayFadeTimerRef = useRef<number | null>(null)
  const terminalMountRef = useRef<HTMLDivElement | null>(null)
  const serverIdLiveRef = useRef(serverId)
  const containerIdLiveRef = useRef<string | undefined>(containerId)
  const connectInFlightRef = useRef(false)
  const mountAliveRef = useRef(true)
  const serverEpochRef = useRef(0)
  const [phase, setPhase] = useState<ConnectionPhase>('disconnected')
  const [errorText, setErrorText] = useState('')
  const [wasEverConnected, setWasEverConnected] = useState(false)
  const [errorDetailsExpanded, setErrorDetailsExpanded] = useState(false)
  const [overlayMounted, setOverlayMounted] = useState(true)
  const [execUser, setExecUser] = useState('')
  const [execShellPreset, setExecShellPreset] = useState<'/bin/ash' | '/bin/bash' | '/bin/sh' | 'custom'>('/bin/sh')
  const [execCustomShell, setExecCustomShell] = useState('')
  const [searchToolbarOpen, setSearchToolbarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [searchResultCount, setSearchResultCount] = useState(0)
  const [toolStatus, setToolStatus] = useState('')

  serverIdLiveRef.current = serverId
  containerIdLiveRef.current = containerId

  useEffect(() => {
    if (phase === 'error') setErrorDetailsExpanded(false)
  }, [phase, errorText])

  useEffect(() => {
    if (!toolStatus) return
    const timer = window.setTimeout(() => setToolStatus(''), 1800)
    return () => window.clearTimeout(timer)
  }, [toolStatus])

  const termWrite = useCallback((data: string | Uint8Array) => {
    xtermRef.current?.write(data)
  }, [])

  const termFocus = useCallback(() => {
    xtermRef.current?.focus()
  }, [])

  const runSearch = useCallback((term: string, direction: 'next' | 'previous' = 'next') => {
    const addon = searchAddonRef.current
    if (!addon) return false
    if (!term.trim()) {
      addon.clearDecorations()
      setSearchResultIndex(0)
      setSearchResultCount(0)
      return false
    }
    return direction === 'previous'
      ? addon.findPrevious(term, {
          decorations: {
            matchBackground: '#3b82f633',
            matchOverviewRuler: '#3b82f6',
            activeMatchBackground: '#f59e0b55',
            activeMatchColorOverviewRuler: '#f59e0b',
          },
        })
      : addon.findNext(term, {
          decorations: {
            matchBackground: '#3b82f633',
            matchOverviewRuler: '#3b82f6',
            activeMatchBackground: '#f59e0b55',
            activeMatchColorOverviewRuler: '#f59e0b',
          },
        })
  }, [])

  const downloadExport = useCallback(async (content: string, filename: string, type: string) => {
    try {
      const path = await save({
        defaultPath: filename,
        filters: [
          {
            name: type === 'text/html;charset=utf-8' ? 'HTML' : 'Text',
            extensions: [type === 'text/html;charset=utf-8' ? 'html' : 'txt'],
          },
        ],
      })
      if (!path) return
      await commands.saveTerminalExport(path, content)
      setToolStatus('已导出文件')
    } catch {
      setToolStatus('导出失败')
    }
  }, [])

  useEffect(() => {
    serverEpochRef.current += 1
    setPhase('disconnected')
    setErrorText('')
    setWasEverConnected(false)
    setOverlayMounted(true)
    setSearchToolbarOpen(false)
    setSearchQuery('')
    setSearchResultIndex(0)
    setSearchResultCount(0)
    setToolStatus('')
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

  const clearBackendResizeSync = useCallback(() => {
    if (backendResizeTimerRef.current !== null) {
      window.clearTimeout(backendResizeTimerRef.current)
      backendResizeTimerRef.current = null
    }
    pendingBackendSizeRef.current = null
    backendSentSizeRef.current = null
  }, [])

  const releaseSessionResources = useCallback(
    (closeBackendSession: boolean) => {
      clearBackendResizeSync()

      const transport = transportRef.current
      transportRef.current = null

      const sid = backendSessionIdRef.current
      backendSessionIdRef.current = null

      if (transport) closeTerminalTransport(transport)
      if (closeBackendSession && sid) void commands.closeTerminal(sid).catch(console.error)
    },
    [clearBackendResizeSync]
  )

  const updateFrontendTerminalSize = useCallback((cols: number, rows: number) => {
    if (cols <= 0 || rows <= 0) return
    sizeRef.current = { cols, rows }
  }, [])

  const flushBackendResize = useCallback((force = false) => {
    const transport = transportRef.current
    const nextSize = pendingBackendSizeRef.current
    if (!nextSize || transport?.readyState !== WebSocket.OPEN) return

    const lastSent = backendSentSizeRef.current
    const changed = !lastSent || lastSent.cols !== nextSize.cols || lastSent.rows !== nextSize.rows
    if (!force && !changed) return

    transport.send(ctrlFrame({ type: 'resize', cols: nextSize.cols, rows: nextSize.rows }))
    backendSentSizeRef.current = nextSize
  }, [])

  const sendBackendResize = useCallback(
    (cols: number, rows: number, force = false) => {
      if (cols <= 0 || rows <= 0) return

      pendingBackendSizeRef.current = { cols, rows }
      if (backendResizeTimerRef.current !== null) {
        window.clearTimeout(backendResizeTimerRef.current)
        backendResizeTimerRef.current = null
      }

      if (force) {
        flushBackendResize(true)
        return
      }

      backendResizeTimerRef.current = window.setTimeout(() => {
        backendResizeTimerRef.current = null
        flushBackendResize(false)
      }, BACKEND_RESIZE_THROTTLE_MS)
    },
    [flushBackendResize]
  )

  const fitTerminalNow = useCallback(() => {
    const terminal = xtermRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) return

    fitAddon.fit()
    updateFrontendTerminalSize(terminal.cols, terminal.rows)
    sendBackendResize(terminal.cols, terminal.rows)
  }, [sendBackendResize, updateFrontendTerminalSize])

  const fitTerminal = useCallback(() => {
    if (fitFrameRef.current !== null) window.cancelAnimationFrame(fitFrameRef.current)
    fitFrameRef.current = window.requestAnimationFrame(() => {
      fitFrameRef.current = null
      fitTerminalNow()
    })
  }, [fitTerminalNow])

  const handleTerminalResize = useCallback(
    ({ cols, rows }: { cols: number; rows: number }) => {
      updateFrontendTerminalSize(cols, rows)
      sendBackendResize(cols, rows)
    },
    [sendBackendResize, updateFrontendTerminalSize]
  )

  const endSession = useCallback(
    (opts: EndSessionOptions) => {
      releaseSessionResources(true)

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
    [releaseSessionResources]
  )

  useEffect(() => {
    mountAliveRef.current = true
    return () => {
      mountAliveRef.current = false
      if (overlayFadeTimerRef.current !== null) {
        window.clearTimeout(overlayFadeTimerRef.current)
        overlayFadeTimerRef.current = null
      }
      releaseSessionResources(true)
    }
  }, [releaseSessionResources])

  const handleTerminalData = useCallback((data: string) => {
    const transport = transportRef.current
    if (transport?.readyState === WebSocket.OPEN) transport.send(ptyFrame(data))
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    searchAddonRef.current?.clearDecorations()
    setSearchResultIndex(0)
    setSearchResultCount(0)
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
      clearBackendResizeSync()

      const transport = await openTerminalTransport(session.session_id, session.ws_port, {
        onPty: termWrite,
        onControl: (msg) => {
          if (msg.type === 'ready') {
            if (mountAliveRef.current) {
              setPhase('connected')
              setWasEverConnected(true)
            }
            requestAnimationFrame(() => {
              sendBackendResize(sizeRef.current.cols, sizeRef.current.rows, true)
              termFocus()
            })
            return
          }
          if (msg.type === 'error') {
            endSession({ updateUi: true, reason: 'error', errorMessage: msg.error.message })
          } else {
            endSession({ updateUi: true, reason: 'remote' })
          }
        },
        onClose: () => {
          if (backendSessionIdRef.current === session.session_id || openedBackendSessionId === session.session_id) {
            endSession({ updateUi: true, reason: 'remote' })
          }
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

      if (!mountAliveRef.current || isStale()) {
        endSession({ updateUi: false })
      }
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
  }, [
    clearBackendResizeSync,
    endSession,
    execCustomShell,
    execShellPreset,
    execUser,
    sendBackendResize,
    termFocus,
    termWrite,
  ])

  useEffect(() => {
    const mount = terminalMountRef.current
    if (!mount) return
    const terminalTheme = XTERM_THEME_MAP[terminalThemeName] ?? XTERM_THEME_MAP.Dracula

    const terminal = new XTerm({
      allowProposedApi: ligatures,
      cursorBlink,
      cursorStyle,
      fontFamily,
      fontSize,
      lineHeight: 1 + lineHeight,
      scrollback,
      theme: {
        ...terminalTheme,
        cursorAccent: terminalTheme.background,
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(mount)
    const unicode11Addon = new Unicode11Addon()
    terminal.loadAddon(unicode11Addon)
    terminal.unicode.activeVersion = '11'
    const imageAddon = new ImageAddon()
    terminal.loadAddon(imageAddon)
    const ligaturesAddon = ligatures ? new LigaturesAddon() : null
    if (ligaturesAddon) terminal.loadAddon(ligaturesAddon)
    const searchAddon = new SearchAddon()
    terminal.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon
    const serializeAddon = new SerializeAddon()
    terminal.loadAddon(serializeAddon)
    serializeAddonRef.current = serializeAddon
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      event.preventDefault()
      void openUrl(uri).catch(() => {})
    })
    terminal.loadAddon(webLinksAddon)
    const rendererAddon = attachRendererAddon(terminal, terminalFrontend)
    const dataDisposable = terminal.onData(handleTerminalData)
    const resizeDisposable = terminal.onResize(handleTerminalResize)
    const searchResultsDisposable = searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
      setSearchResultIndex(resultCount > 0 ? resultIndex + 1 : 0)
      setSearchResultCount(resultCount)
    })

    xtermRef.current = terminal
    fitAddonRef.current = fitAddon
    fitTerminal()

    const handleWindowResize = () => fitTerminal()
    const ro = new ResizeObserver(() => fitTerminal())
    ro.observe(mount)
    window.addEventListener('resize', handleWindowResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', handleWindowResize)
      if (fitFrameRef.current !== null) {
        window.cancelAnimationFrame(fitFrameRef.current)
        fitFrameRef.current = null
      }
      xtermRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      serializeAddonRef.current = null
      dataDisposable.dispose()
      resizeDisposable.dispose()
      searchResultsDisposable.dispose()
      rendererAddon?.dispose()
      webLinksAddon.dispose()
      serializeAddon.dispose()
      searchAddon.dispose()
      ligaturesAddon?.dispose()
      imageAddon.dispose()
      unicode11Addon.dispose()
      terminal.dispose()
    }
  }, [
    cursorBlink,
    cursorStyle,
    fitTerminal,
    fontFamily,
    fontSize,
    handleTerminalData,
    ligatures,
    lineHeight,
    scrollback,
    handleTerminalResize,
    terminalThemeName,
    terminalFrontend,
  ])

  useEffect(() => {
    if (phase !== 'connected') return
    fitTerminal()
  }, [fitTerminal, phase])

  const overlayVisible = phase !== 'connected'
  const terminalVisible = phase === 'connected'
  const isContainerExec = Boolean(containerId)

  return (
    <div
      className="relative h-full w-full overflow-hidden select-text"
      style={{
        background: (XTERM_THEME_MAP[terminalThemeName] ?? XTERM_THEME_MAP.Dracula).background ?? TERMINAL_SURFACE_BG,
      }}
    >
      <div
        className="absolute inset-0 box-border"
        style={{
          padding: TERMINAL_VIEW_PADDING_PX,
          visibility: terminalVisible ? 'visible' : 'hidden',
        }}
      >
        <div className="pointer-events-none absolute top-2 right-2 left-2 z-10 flex justify-end">
          {searchToolbarOpen ? (
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border/70 bg-background/85 p-2 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Search className="size-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => {
                    const nextQuery = event.target.value
                    setSearchQuery(nextQuery)
                    runSearch(nextQuery)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      runSearch(searchQuery, event.shiftKey ? 'previous' : 'next')
                    }
                    if (event.key === 'Escape') {
                      clearSearch()
                      setSearchToolbarOpen(false)
                    }
                  }}
                  placeholder="搜索终端内容"
                  className="h-8 w-52 rounded-md border-border bg-card/80 px-2.5 py-0 text-sm"
                />
                <span className="min-w-12 text-center text-xs text-muted-foreground">
                  {searchResultCount > 0 ? `${searchResultIndex}/${searchResultCount}` : '0/0'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  onClick={() => runSearch(searchQuery, 'previous')}
                >
                  <ChevronDown className="rotate-180" />
                </Button>
                <Button type="button" variant="outline" size="icon-xs" onClick={() => runSearch(searchQuery, 'next')}>
                  <ChevronDown />
                </Button>
                <Button type="button" variant="outline" size="icon-xs" onClick={clearSearch}>
                  <X />
                </Button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
                  <Download />
                  导出
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem
                    onClick={() => {
                      const content = serializeAddonRef.current?.serialize()
                      if (!content) return
                      downloadExport(content, 'terminal.txt', 'text/plain;charset=utf-8')
                    }}
                  >
                    导出 TXT
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const content = serializeAddonRef.current?.serializeAsHTML()
                      if (!content) return
                      downloadExport(content, 'terminal.html', 'text/html;charset=utf-8')
                    }}
                  >
                    导出 HTML
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                onClick={() => {
                  clearSearch()
                  setSearchToolbarOpen(false)
                }}
              >
                <Search />
              </Button>

              {toolStatus ? <span className="text-xs text-muted-foreground">{toolStatus}</span> : null}
            </div>
          ) : (
            <div className="pointer-events-auto">
              <Button type="button" variant="outline" size="icon-sm" onClick={() => setSearchToolbarOpen(true)}>
                <Search />
              </Button>
            </div>
          )}
        </div>
        <div ref={terminalMountRef} className="h-full w-full overflow-hidden" />
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
