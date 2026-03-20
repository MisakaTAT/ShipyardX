import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  Loader2,
  Box,
  Search,
  X,
  BarChart2,
  Timer,
} from "lucide-react";
import type { Container } from "../types";
import LogModal from "./LogModal";
import StatsModal from "./StatsModal";

interface ContainerPanelProps {
  serverId: string;
}

const REFRESH_INTERVALS = [
  { label: "5 秒", value: 5000 },
  { label: "15 秒", value: 15000 },
  { label: "30 秒", value: 30000 },
  { label: "60 秒", value: 60000 },
];

function StateBadge({ state }: { state: string }) {
  const s = state.toLowerCase();
  if (s === "running") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-400 border border-green-800/50">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        运行中
      </span>
    );
  }
  if (s === "exited" || s === "dead") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-800/40">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        已停止
      </span>
    );
  }
  if (s === "paused") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-400 border border-yellow-800/40">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        已暂停
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      {state}
    </span>
  );
}

export default function ContainerPanel({ serverId }: ContainerPanelProps) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [logTarget, setLogTarget] = useState<Container | null>(null);
  const [statsTarget, setStatsTarget] = useState<Container | null>(null);
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(15000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchContainers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke<Container[]>("list_containers", { serverId });
      setContainers(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { fetchContainers(); }, [fetchContainers]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchContainers, refreshInterval);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, refreshInterval, fetchContainers]);

  // 按 "/" 聚焦搜索
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const runAction = async (
    containerId: string,
    action: string,
    command: string,
    args: Record<string, unknown> = {}
  ) => {
    setActionLoading((prev) => ({ ...prev, [containerId]: action }));
    try {
      await invoke(command, { serverId, containerId, ...args });
      await fetchContainers();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[containerId];
        return next;
      });
    }
  };

  const handleRemove = async (container: Container) => {
    const isRunning = container.state === "running";
    const msg = isRunning
      ? `容器 "${container.name}" 正在运行，是否强制删除？`
      : `确认删除容器 "${container.name}"？`;
    if (!confirm(msg)) return;
    await runAction(container.id, "remove", "remove_container", { force: isRunning });
  };

  // 过滤
  const filtered = containers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.image.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    );
  });

  const runningCount = containers.filter(c => c.state === "running").length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-700/50 shrink-0 flex-wrap">
        <Box className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-sm font-medium text-slate-300 mr-1">
          容器
        </span>
        {containers.length > 0 && (
          <span className="text-xs text-slate-500">
            {runningCount}/{containers.length} 运行中
          </span>
        )}

        {/* 搜索 */}
        <div className="relative ml-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索… ("/" 快速聚焦)'
            className="w-52 pl-8 pr-7 py-1 text-xs bg-slate-800 border border-slate-700 rounded-lg
              text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-600 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* 自动刷新 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAutoRefresh(r => !r)}
              title={autoRefresh ? "停止自动刷新" : "开启自动刷新"}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition-colors
                ${autoRefresh
                  ? "bg-blue-900/30 border-blue-700/50 text-blue-400"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
            >
              <Timer className={`w-3.5 h-3.5 ${autoRefresh ? "animate-pulse" : ""}`} />
              {autoRefresh ? "自动" : "手动"}
            </button>
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-slate-400 text-xs rounded-lg px-1.5 py-1.5"
              >
                {REFRESH_INTERVALS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* 刷新 */}
          <button
            onClick={fetchContainers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200
              bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            刷新
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mt-3 px-4 py-2.5 bg-red-900/20 border border-red-800/50 rounded-lg text-xs text-red-400 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 flex-shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && containers.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500">
            <Box className="w-10 h-10 mb-3 text-slate-700" />
            <p className="text-sm">{search ? `无匹配的容器 "${search}"` : "没有容器"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm">
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">名称</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">镜像</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">端口</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">创建时间</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((c) => {
                const busy = actionLoading[c.id];
                const isRunning = c.state === "running";
                return (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-200">{c.name}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{c.id}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="text-slate-400 text-xs font-mono truncate block" title={c.image}>{c.image}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StateBadge state={c.state} />
                      <div className="text-xs text-slate-500 mt-1">{c.status}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400 font-mono">{c.ports || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.running_for}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isRunning ? (
                          <ActionBtn onClick={() => runAction(c.id, "stop", "stop_container")}
                            loading={busy === "stop"} icon={<Square className="w-3.5 h-3.5" />}
                            title="停止" colorClass="hover:bg-yellow-900/50 hover:text-yellow-400" />
                        ) : (
                          <ActionBtn onClick={() => runAction(c.id, "start", "start_container")}
                            loading={busy === "start"} icon={<Play className="w-3.5 h-3.5" />}
                            title="启动" colorClass="hover:bg-green-900/50 hover:text-green-400" />
                        )}
                        <ActionBtn onClick={() => runAction(c.id, "restart", "restart_container")}
                          loading={busy === "restart"} icon={<RotateCcw className="w-3.5 h-3.5" />}
                          title="重启" colorClass="hover:bg-blue-900/50 hover:text-blue-400" />
                        {/* Stats — 仅运行中可用 */}
                        {isRunning && (
                          <ActionBtn onClick={() => setStatsTarget(c)}
                            loading={false} icon={<BarChart2 className="w-3.5 h-3.5" />}
                            title="资源监控" colorClass="hover:bg-purple-900/50 hover:text-purple-400" />
                        )}
                        <ActionBtn onClick={() => setLogTarget(c)}
                          loading={false} icon={<FileText className="w-3.5 h-3.5" />}
                          title="日志" colorClass="hover:bg-slate-700 hover:text-slate-200" />
                        <ActionBtn onClick={() => handleRemove(c)}
                          loading={busy === "remove"} icon={<Trash2 className="w-3.5 h-3.5" />}
                          title="删除" colorClass="hover:bg-red-900/50 hover:text-red-400" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {logTarget && (
        <LogModal
          serverId={serverId}
          containerId={logTarget.id}
          containerName={logTarget.name}
          onClose={() => setLogTarget(null)}
        />
      )}

      {statsTarget && (
        <StatsModal
          serverId={serverId}
          containerId={statsTarget.id}
          containerName={statsTarget.name}
          onClose={() => setStatsTarget(null)}
        />
      )}
    </div>
  );
}

function ActionBtn({
  onClick, loading, icon, title, colorClass,
}: {
  onClick: () => void;
  loading: boolean;
  icon: ReactNode;
  title: string;
  colorClass: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`p-1.5 rounded-lg text-slate-500 transition-colors disabled:opacity-40 ${colorClass}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
    </button>
  );
}
