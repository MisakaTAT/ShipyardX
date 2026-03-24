import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Cpu, MemoryStick, Network, HardDrive } from "lucide-react";
import type { ContainerStats } from "../types";

interface Props {
  serverId: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

interface GaugeProps {
  value: number;
  color: string;
  label: string;
  sublabel?: string;
}

function Gauge({ value, color, label, sublabel }: GaugeProps) {
  const pct = Math.min(100, Math.max(0, value));
  const stroke = 2 * Math.PI * 40;
  const filled = (pct / 100) * stroke;

  const colorMap: Record<string, string> = {
    blue: "#58a6ff",
    green: "#3fb950",
    yellow: "#d29922",
    red: "#ff7b72",
    purple: "#bc8cff",
    cyan: "#39c5cf",
  };
  const strokeColor =
    colorMap[pct > 85 ? "red" : pct > 70 ? "yellow" : color] ?? colorMap[color] ?? "#58a6ff";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={strokeColor} strokeWidth="10"
            strokeDasharray={`${filled} ${stroke - filled}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium" style={{ color: "var(--text-base)" }}>{label}</div>
        {sublabel && <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sublabel}</div>}
      </div>
    </div>
  );
}

interface StatRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subvalue?: string;
  color: string;
}

function StatRow({ icon, label, value, subvalue, color }: StatRowProps) {
  const colorMap: Record<string, string> = {
    blue: "#58a6ff",
    green: "#3fb950",
    yellow: "#d29922",
    purple: "#bc8cff",
    cyan: "#39c5cf",
  };
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="shrink-0" style={{ color: colorMap[color] ?? "#58a6ff" }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
        <div className="text-sm font-semibold truncate" style={{ color: "var(--text-strong)" }}>{value}</div>
        {subvalue && <div className="text-xs" style={{ color: "var(--text-soft)" }}>{subvalue}</div>}
      </div>
    </div>
  );
}

export default function StatsModal({ serverId, containerId, containerName, onClose }: Props) {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await invoke<ContainerStats>("get_container_stats", { serverId, containerId });
      setStats(s);
      setLastUpdated(new Date().toLocaleTimeString("zh-CN"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [serverId, containerId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    intervalRef.current = setInterval(fetchStats, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchStats]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-xl w-full max-w-xl shadow-2xl border"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-sub)" }}
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <Cpu size={16} style={{ color: "var(--accent-text)" }} />
          <span className="text-sm font-semibold font-mono flex-1 truncate" style={{ color: "var(--text-strong)" }}>
            {containerName}
          </span>

          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-base)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-xs">
              {error}
            </div>
          )}

          {loading && !stats && (
            <div className="flex items-center justify-center py-12 gap-3" style={{ color: "var(--text-muted)" }}>
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">获取资源数据中...</span>
            </div>
          )}

          {stats && (
            <>
              {/* CPU + 内存 圆形仪表 */}
              <div className="flex justify-around py-2">
                <Gauge
                  value={stats.cpu_percent}
                  color="blue"
                  label="CPU 使用率"
                  sublabel={`${stats.cpu_percent}%`}
                />
                <Gauge
                  value={stats.mem_percent}
                  color="green"
                  label="内存使用率"
                  sublabel={`${fmtBytes(stats.mem_usage)} / ${fmtBytes(stats.mem_limit)}`}
                />
              </div>

              {/* 详细指标 */}
              <div className="grid grid-cols-2 gap-2">
                <StatRow
                  icon={<MemoryStick size={16} />}
                  label="内存使用"
                  value={fmtBytes(stats.mem_usage)}
                  subvalue={`限制: ${fmtBytes(stats.mem_limit)}`}
                  color="green"
                />
                <StatRow
                  icon={<Cpu size={16} />}
                  label="CPU"
                  value={`${stats.cpu_percent}%`}
                  color="blue"
                />
                <StatRow
                  icon={<Network size={16} />}
                  label="网络 接收 / 发送"
                  value={`${fmtBytes(stats.net_rx)} / ${fmtBytes(stats.net_tx)}`}
                  color="cyan"
                />
                <StatRow
                  icon={<HardDrive size={16} />}
                  label="磁盘 读 / 写"
                  value={`${fmtBytes(stats.blk_read)} / ${fmtBytes(stats.blk_write)}`}
                  color="purple"
                />
              </div>

              {lastUpdated && (
                <div className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
                  更新于 {lastUpdated}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
