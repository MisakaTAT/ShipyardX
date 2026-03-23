import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Loader2, TerminalIcon } from "lucide-react";

interface TerminalPanelProps {
  serverId: string;
  serverName: string;
}

type Status = "connecting" | "connected" | "closed" | "error";

const XTERM_THEME = {
  background: "#0f172a",
  foreground: "#e2e8f0",
  cursor: "#60a5fa",
  cursorAccent: "#0f172a",
  selectionBackground: "#3b82f680",
  black: "#1e293b",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#34d399",
  white: "#e2e8f0",
  brightBlack: "#475569",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde68a",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#6ee7b7",
  brightWhite: "#f8fafc",
};

export default function TerminalPanel({ serverId, serverName }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const unlistensRef = useRef<UnlistenFn[]>([]);
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    if (!containerRef.current) return;

    // 初始化 xterm.js
    const term = new Terminal({
      fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      theme: XTERM_THEME,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    // 延迟 fit 确保容器已渲染
    requestAnimationFrame(() => fitAddon.fit());

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const { cols, rows } = term;

    // 打开 SSH 终端会话
    invoke<string>("open_terminal", { serverId, cols, rows })
      .then(async (sessionId) => {
        sessionIdRef.current = sessionId;
        setStatus("connected");

        // 监听终端输出
        const unlistenOutput = await listen<number[]>(
          `terminal-output:${sessionId}`,
          (event) => {
            term.write(new Uint8Array(event.payload));
          }
        );

        // 监听终端关闭
        const unlistenClose = await listen<null>(
          `terminal-closed:${sessionId}`,
          () => {
            setStatus("closed");
            term.writeln("\r\n\x1b[33m[ 连接已关闭 ]\x1b[0m");
            term.options.disableStdin = true;
          }
        );

        unlistensRef.current = [unlistenOutput, unlistenClose];

        // 将键盘输入发送到 SSH
        term.onData((data) => {
          const sessionId = sessionIdRef.current;
          if (!sessionId) return;
          const bytes = Array.from(new TextEncoder().encode(data));
          invoke("write_terminal", { sessionId, data: bytes }).catch(console.error);
        });

        // 二进制输入（如粘贴）
        term.onBinary((data) => {
          const sessionId = sessionIdRef.current;
          if (!sessionId) return;
          const bytes = Array.from(Uint8Array.from(data, (c) => c.charCodeAt(0)));
          invoke("write_terminal", { sessionId, data: bytes }).catch(console.error);
        });

        // 同步终端尺寸变化到 SSH PTY
        term.onResize(({ cols, rows }) => {
          const sessionId = sessionIdRef.current;
          if (!sessionId) return;
          invoke("resize_terminal", { sessionId, cols, rows }).catch(console.error);
        });
      })
      .catch((e) => {
        setStatus("error");
        term.writeln(`\x1b[31m连接失败: ${e}\x1b[0m`);
      });

    // 响应窗口尺寸变化
    const handleResize = () => fitAddonRef.current?.fit();
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      unlistensRef.current.forEach((fn) => fn());
      unlistensRef.current = [];

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        invoke("close_terminal", { sessionId }).catch(console.error);
        sessionIdRef.current = null;
      }
      term.dispose();
    };
  }, [serverId]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#0d1117" }}>
      {/* 状态栏 */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b shrink-0"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
      >
        <TerminalIcon className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{serverName}</span>
        <span style={{ color: "var(--border-sub)" }}>·</span>
        <StatusBadge status={status} />
      </div>

      {/* 终端容器（始终暗色背景） */}
      <div className="flex-1 relative overflow-hidden" style={{ background: "#0d1117" }}>
        {status === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-muted)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>正在建立 SSH 连接...</span>
          </div>
        )}
        {/* xterm.js 挂载点 */}
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ padding: "8px" }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const configs: Record<Status, { color: string; text: string; dot?: boolean }> = {
    connecting: { color: "text-yellow-500", text: "连接中...", dot: true },
    connected: { color: "text-green-400", text: "已连接", dot: true },
    closed: { color: "text-slate-500", text: "已断开" },
    error: { color: "text-red-400", text: "连接失败" },
  };

  const cfg = configs[status];
  return (
    <span className={`flex items-center gap-1 text-xs ${cfg.color}`}>
      {cfg.dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            status === "connected"
              ? "bg-green-400 animate-pulse"
              : status === "connecting"
              ? "bg-yellow-500 animate-pulse"
              : "bg-slate-500"
          }`}
        />
      )}
      {cfg.text}
    </span>
  );
}
