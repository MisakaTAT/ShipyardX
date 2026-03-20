import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import type { DockerInfo } from "../types";

interface Props {
  serverId: string;
}

function fmtMem(bytes: number): string {
  const gb = bytes / 1_073_741_824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`;
}

interface Cell {
  label: string;
  value: string | number;
  highlight?: boolean;
  warn?: boolean;
}

export default function ServerOverview({ serverId }: Props) {
  const [info, setInfo] = useState<DockerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const d = await invoke<DockerInfo>("get_docker_info", { serverId });
      setInfo(d);
    } catch {
      // 静默失败，服务器可能不支持 Docker
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { fetch(); }, [fetch]);

  if (!info && !loading) return null;

  const rows: Cell[][] = info ? [
    [
      { label: "容器数", value: info.containers },
      { label: "警告数", value: info.warnings, warn: info.warnings > 0 },
      { label: "主机名", value: info.name },
      { label: "操作系统", value: info.os },
    ],
    [
      { label: "运行中", value: info.containers_running, highlight: true },
      { label: "镜像数", value: info.images },
      { label: "处理器", value: info.ncpu },
      { label: "系统版本", value: info.os_version || "—" },
    ],
    [
      { label: "已暂停", value: info.containers_paused },
      { label: "引擎版本", value: info.server_version },
      { label: "内存", value: fmtMem(info.mem_total) },
      { label: "内核版本", value: info.kernel_version },
    ],
    [
      { label: "已停止", value: info.containers_stopped },
      { label: "存储驱动", value: info.storage_driver },
      { label: "架构", value: info.architecture },
      { label: "系统类型", value: "linux" },
    ],
  ] : [];

  return (
    <div className="shrink-0 border-b" style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}>
      {/* 折叠条 */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs font-medium text-[#8b949e]">主机概览</span>
          {info?.warnings ? (
            <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">
              <AlertTriangle size={10} />
              {info.warnings} 个警告
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetch}
            disabled={loading}
            className="p-1 rounded text-[#6e7681] hover:text-[#8b949e] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1 rounded text-[#6e7681] hover:text-[#8b949e] transition-colors"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* 统计网格 */}
      {!collapsed && (
        <div className="px-4 pb-3">
          {loading && !info ? (
            <div className="flex items-center gap-2 py-4 text-[#6e7681] text-xs">
              <div className="w-3 h-3 border border-[#1f6feb] border-t-transparent rounded-full animate-spin" />
              加载主机信息...
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              {rows.map((row, ri) => (
                <div
                  key={ri}
                  className="grid grid-cols-4"
                  style={ri < rows.length - 1 ? { borderBottom: "1px solid var(--border)" } : {}}
                >
                  {row.map((cell, ci) => (
                    <div
                      key={ci}
                      className="flex items-center gap-3 px-3 py-2"
                      style={ci < 3 ? { borderRight: "1px solid var(--border)" } : {}}
                    >
                      <span className="text-xs w-16 shrink-0" style={{ color: "var(--text-muted)" }}>{cell.label}</span>
                      <span
                        className={`text-xs font-medium truncate
                          ${cell.warn ? "text-yellow-500" : ""}
                          ${cell.highlight ? "text-green-500" : ""}
                        `}
                        style={!cell.warn && !cell.highlight ? { color: "var(--text-base)" } : {}}
                        title={String(cell.value)}
                      >
                        {String(cell.value)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
