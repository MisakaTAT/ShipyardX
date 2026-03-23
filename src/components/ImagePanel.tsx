import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  RefreshCw,
  Trash2,
  Download,
  Loader2,
  Image as ImageIcon,
  Search,
  X,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { DockerImage } from "../types";

interface ImagePanelProps {
  serverId: string;
}

export default function ImagePanel({ serverId }: ImagePanelProps) {
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPull, setShowPull] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke<DockerImage[]>("list_images", { serverId });
      setImages(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { fetchImages(); }, [fetchImages]);

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

  const handleRemove = async (img: DockerImage) => {
    const ref = img.tag !== "<none>" ? `${img.repository}:${img.tag}` : img.id;
    if (!confirm(`确认删除镜像 "${ref}"？\n（如有容器正在使用此镜像将会失败）`)) return;
    try {
      await invoke("remove_image", { serverId, imageId: img.id });
      await fetchImages();
    } catch (e) {
      setError(String(e));
    }
  };

  const filtered = images.filter((img) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      img.repository.toLowerCase().includes(q) ||
      img.tag.toLowerCase().includes(q) ||
      img.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-app)" }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-5 py-3 border-b shrink-0 flex-wrap"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
      >
        <ImageIcon className="w-4 h-4 shrink-0" style={{ color: "var(--text-soft)" }} />
        <span className="text-sm font-medium mr-1" style={{ color: "var(--text-base)" }}>镜像</span>
        {images.length > 0 && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>({images.length})</span>
        )}

        {/* 搜索 */}
        <div className="relative ml-2">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索… ("/" 快速聚焦)'
            className="w-48 pl-8 pr-7 py-1 text-xs rounded-lg border outline-none transition-colors"
            style={{
              background: "var(--bg-input)",
              borderColor: "var(--border-sub)",
              color: "var(--text-base)",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowPull(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-500 hover:text-blue-400
              bg-blue-500/10 hover:bg-blue-500/20 rounded-lg border border-blue-500/30 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            拉取镜像
          </button>
          <button
            onClick={fetchImages}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border)",
              color: "var(--text-soft)",
            }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            刷新
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mt-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-500 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && images.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: "var(--text-muted)" }}>
            <ImageIcon className="w-10 h-10 mb-3" style={{ color: "var(--border-sub)" }} />
            <p className="text-sm">{search ? `无匹配的镜像 "${search}"` : "没有镜像"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 backdrop-blur-sm" style={{ background: "var(--bg-panel)" }}>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>仓库</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>标签</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>大小</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>创建时间</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((img) => (
                <tr
                  key={img.id}
                  className="border-b transition-colors"
                  style={{ borderColor: "var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-5 py-3 max-w-[220px]">
                    <span className="font-mono text-xs truncate block" style={{ color: "var(--text-base)" }} title={img.repository}>
                      {img.repository}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {img.tag === "<none>" ? (
                      <span className="text-xs italic" style={{ color: "var(--text-muted)" }}>无标签</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-blue-500/10 text-blue-500 border border-blue-500/30">
                        {img.tag}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {img.id.replace("sha256:", "").slice(0, 12)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-soft)" }}>{img.size}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{img.created_at}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => handleRemove(img)}
                        title="删除"
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-500"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pull Modal */}
      {showPull && (
        <PullModal
          serverId={serverId}
          onSuccess={fetchImages}
          onClose={() => setShowPull(false)}
        />
      )}
    </div>
  );
}

// ===== 流式拉取 Modal =====

interface PullModalProps {
  serverId: string;
  onSuccess: () => void;
  onClose: () => void;
}

function PullModal({ serverId, onSuccess, onClose }: PullModalProps) {
  const [image, setImage] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "pulling" | "success" | "error">("idle");
  const [pullId, setPullId] = useState<string | null>(null);
  const unlistenDataRef = useRef<UnlistenFn | null>(null);
  const unlistenDoneRef = useRef<UnlistenFn | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  const cleanup = useCallback(async (id?: string | null) => {
    if (unlistenDataRef.current) { unlistenDataRef.current(); unlistenDataRef.current = null; }
    if (unlistenDoneRef.current) { unlistenDoneRef.current(); unlistenDoneRef.current = null; }
    const target = id ?? pullId;
    if (target) {
      try { await invoke("cancel_stream", { streamId: target }); } catch { /* ignore */ }
      setPullId(null);
    }
  }, [pullId]);

  const handlePull = async () => {
    const img = image.trim();
    if (!img) return;
    await cleanup();
    setStatus("pulling");
    setLines([`> docker pull ${img}`, ""]);

    try {
      const id = await invoke<string>("start_image_pull", { serverId, image: img });
      setPullId(id);

      unlistenDataRef.current = await listen<string>(`pull-data:${id}`, (event) => {
        const chunk = event.payload;
        setLines(prev => {
          const newLines = chunk.split("\n");
          if (prev.length > 0 && !prev[prev.length - 1].endsWith("\n")) {
            const updated = [...prev];
            updated[updated.length - 1] += newLines[0];
            return [...updated, ...newLines.slice(1)];
          }
          return [...prev, ...newLines];
        });
      });

      unlistenDoneRef.current = await listen<boolean>(`pull-done:${id}`, (event) => {
        const success = event.payload;
        setStatus(success ? "success" : "error");
        if (success) {
          setLines(prev => [...prev, "", "✓ 拉取成功"]);
          onSuccess();
        } else {
          setLines(prev => [...prev, "", "✗ 拉取失败"]);
        }
        setPullId(null);
      });
    } catch (e) {
      setStatus("error");
      setLines(prev => [...prev, `错误: ${String(e)}`]);
    }
  };

  const handleClose = async () => {
    await cleanup();
    onClose();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="rounded-xl w-full max-w-lg shadow-2xl border"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-sub)" }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <Download size={16} style={{ color: "var(--accent-text)" }} />
          <span className="text-sm font-semibold flex-1" style={{ color: "var(--text-strong)" }}>拉取镜像</span>
          <button
            onClick={handleClose}
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

        <div className="p-4 space-y-3">
          {/* 输入 */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={image}
              onChange={(e) => setImage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && status !== "pulling" && handlePull()}
              placeholder="nginx:latest 或 ubuntu:22.04"
              disabled={status === "pulling"}
              className="flex-1 px-3 py-2 text-sm rounded-lg border outline-none disabled:opacity-50 transition-colors font-mono"
              style={{
                background: "var(--bg-input)",
                borderColor: "var(--border-sub)",
                color: "var(--text-base)",
              }}
            />
            <button
              onClick={handlePull}
              disabled={!image.trim() || status === "pulling"}
              className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-500 text-white
                rounded-lg disabled:opacity-40 transition-colors flex items-center gap-2"
            >
              {status === "pulling"
                ? <><Loader2 size={14} className="animate-spin" /> 拉取中</>
                : <><Download size={14} /> 拉取</>}
            </button>
          </div>

          {/* 输出 */}
          {lines.length > 0 && (
            <div
              ref={outputRef}
              className="rounded-lg border p-3 h-52 overflow-y-auto"
              style={{ background: "var(--bg-app)", borderColor: "var(--border)" }}
            >
              <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed" style={{ color: "var(--text-base)" }}>
                {lines.join("\n")}
              </pre>
            </div>
          )}

          {/* 状态 */}
          {(status === "success" || status === "error") && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm
              ${status === "success"
                ? "bg-green-500/10 border border-green-500/30 text-green-500"
                : "bg-red-500/10 border border-red-500/30 text-red-500"
              }`}
            >
              {status === "success"
                ? <CheckCircle size={15} />
                : <XCircle size={15} />}
              {status === "success" ? "镜像拉取成功，列表已刷新" : "拉取失败，请检查镜像名称"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
