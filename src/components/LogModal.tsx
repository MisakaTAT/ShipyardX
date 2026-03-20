import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X, RefreshCw, Play, Square, Clock, Copy, Check } from "lucide-react";

interface Props {
  serverId: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
}

const TAIL_OPTIONS = [50, 100, 200, 500, 1000] as const;

function formatTimestamp(): string {
  return new Date().toLocaleTimeString("zh-CN");
}

export default function LogModal({ serverId, containerId, containerName, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const unlistenDataRef = useRef<UnlistenFn | null>(null);
  const unlistenDoneRef = useRef<UnlistenFn | null>(null);

  const [tail, setTail] = useState<number>(100);
  const [timestamps, setTimestamps] = useState(false);
  const [follow, setFollow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [lineCount, setLineCount] = useState(0);

  // 初始化 xterm
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#e6edf3",
        black: "#21262d",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
        selectionBackground: "#264f78",
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: 5000,
      disableStdin: true,
      cursorBlink: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    setTimeout(() => fitAddon.fit(), 50);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const ro = new ResizeObserver(() => fitAddon.fit());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // 停止当前流
  const stopStream = useCallback(async () => {
    if (unlistenDataRef.current) { unlistenDataRef.current(); unlistenDataRef.current = null; }
    if (unlistenDoneRef.current) { unlistenDoneRef.current(); unlistenDoneRef.current = null; }
    if (streamIdRef.current) {
      try { await invoke("stop_log_stream", { streamId: streamIdRef.current }); } catch { /* ignore */ }
      streamIdRef.current = null;
    }
  }, []);

  // 静态加载日志
  const loadStaticLogs = useCallback(async () => {
    await stopStream();
    setError("");
    setLoading(true);
    termRef.current?.clear();
    setLineCount(0);
    try {
      const logs = await invoke<string>("get_container_logs", {
        serverId,
        containerId,
        tail,
        timestamps,
      });
      if (termRef.current) {
        const lines = logs.split("\n");
        setLineCount(lines.filter(l => l).length);
        termRef.current.write(
          logs.replace(/\r?\n/g, "\r\n")
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [serverId, containerId, tail, timestamps, stopStream]);

  // 启动 follow 流
  const startFollow = useCallback(async () => {
    await stopStream();
    setError("");
    termRef.current?.clear();
    setLineCount(0);
    termRef.current?.write(
      `\x1b[2m[${formatTimestamp()}] 正在连接日志流...\x1b[0m\r\n`
    );

    try {
      const streamId = await invoke<string>("start_log_stream", {
        serverId,
        containerId,
        tail,
        timestamps,
      });
      streamIdRef.current = streamId;

      let count = 0;
      unlistenDataRef.current = await listen<number[]>(
        `log-data:${streamId}`,
        (event) => {
          const bytes = new Uint8Array(event.payload);
          termRef.current?.write(bytes);
          // 粗略计算新行数
          count += event.payload.filter((b: number) => b === 10).length;
          setLineCount(count);
        }
      );

      unlistenDoneRef.current = await listen(
        `log-done:${streamId}`,
        () => {
          termRef.current?.write(
            `\r\n\x1b[2m[${formatTimestamp()}] 日志流已结束\x1b[0m\r\n`
          );
          setFollow(false);
          streamIdRef.current = null;
        }
      );
    } catch (e) {
      setError(String(e));
      setFollow(false);
    }
  }, [serverId, containerId, tail, timestamps, stopStream]);

  // follow 开关切换
  useEffect(() => {
    if (follow) {
      startFollow();
    } else {
      // 如果 follow 被关闭，停止流并改为静态加载
      stopStream().then(() => loadStaticLogs());
    }
    return () => { stopStream(); };
  }, [follow]); // eslint-disable-line react-hooks/exhaustive-deps

  // tail / timestamps 变化时重新加载（非 follow 状态）
  useEffect(() => {
    if (!follow) {
      loadStaticLogs();
    }
  }, [tail, timestamps]); // eslint-disable-line react-hooks/exhaustive-deps

  // 初次挂载加载
  useEffect(() => {
    if (!follow) loadStaticLogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 关闭时清理
  const handleClose = useCallback(async () => {
    await stopStream();
    onClose();
  }, [stopStream, onClose]);

  // Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  // 复制全部内容
  const handleCopy = useCallback(() => {
    if (!termRef.current) return;
    termRef.current.selectAll();
    const fullText = termRef.current.getSelection();
    termRef.current.clearSelection();
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-5xl flex flex-col shadow-2xl"
        style={{ height: "80vh" }}>

        {/* 工具栏 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#30363d] flex-shrink-0 flex-wrap">
          <span className="text-sm font-semibold text-[#e6edf3] mr-1 font-mono">
            {containerName}
          </span>
          <span className="text-[#6e7681] text-xs mr-2">日志</span>

          {/* Tail 选择 */}
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            disabled={follow}
            className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] text-xs rounded px-2 py-1 disabled:opacity-40"
          >
            {TAIL_OPTIONS.map(n => (
              <option key={n} value={n}>后 {n} 行</option>
            ))}
          </select>

          {/* 时间戳 */}
          <button
            onClick={() => setTimestamps(t => !t)}
            disabled={follow}
            title="显示时间戳"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors disabled:opacity-40
              ${timestamps
                ? "bg-[#1f6feb]/20 border-[#1f6feb] text-[#58a6ff]"
                : "bg-[#21262d] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]"
              }`}
          >
            <Clock size={12} />
            时间戳
          </button>

          {/* Follow 切换 */}
          <button
            onClick={() => setFollow(f => !f)}
            title={follow ? "停止跟踪" : "实时跟踪"}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs border font-medium transition-colors
              ${follow
                ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
                : "bg-[#238636]/20 border-[#238636]/40 text-[#3fb950] hover:bg-[#238636]/30"
              }`}
          >
            {follow ? <><Square size={12} /> 停止</> : <><Play size={12} /> 跟踪</>}
          </button>

          {/* 刷新（静态模式） */}
          {!follow && (
            <button
              onClick={loadStaticLogs}
              disabled={loading}
              title="刷新"
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-[#30363d]
                bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          )}

          {/* 复制 */}
          <button
            onClick={handleCopy}
            title="复制全部"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-[#30363d]
              bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>

          {lineCount > 0 && (
            <span className="text-[#6e7681] text-xs ml-auto">{lineCount} 行</span>
          )}

          {/* 关闭 */}
          <button
            onClick={handleClose}
            className="ml-auto p-1 rounded text-[#6e7681] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex-shrink-0">
            {error}
          </div>
        )}

        {/* xterm 容器 */}
        <div className="flex-1 overflow-hidden p-2 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]/60 z-10">
              <div className="flex items-center gap-2 text-[#8b949e] text-sm">
                <div className="w-4 h-4 border-2 border-[#1f6feb] border-t-transparent rounded-full animate-spin" />
                加载中...
              </div>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
