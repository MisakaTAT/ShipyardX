import { useState } from "react";
import { Server as ServerIcon, Plus, Trash2, Pencil, Search, X } from "lucide-react";
import type { Server } from "../types";

interface SidebarProps {
  servers: Server[];
  selectedId: string | null;
  onSelect: (server: Server) => void;
  onAdd: () => void;
  onEdit: (server: Server) => void;
  onDelete: (id: string) => void;
}

export default function Sidebar({
  servers,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: SidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.host.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="w-52 flex flex-col shrink-0 border-r"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
    >
      {/* 搜索 */}
      <div className="p-2.5 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索"
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border outline-none transition-colors"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-sub)",
              color: "var(--text-base)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-sub)")}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* 服务器列表 */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <ServerIcon
              className="w-7 h-7 mx-auto mb-2"
              style={{ color: "var(--border-sub)" }}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {search ? "无匹配服务器" : "暂无服务器"}
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5 px-1.5">
            {filtered.map((server) => {
              const active = selectedId === server.id;
              return (
                <li key={server.id}>
                  <div
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all"
                    style={
                      active
                        ? {
                            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                            borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
                            border: "1px solid",
                          }
                        : { border: "1px solid transparent" }
                    }
                    onMouseEnter={(e) => {
                      if (!active)
                        (e.currentTarget as HTMLDivElement).style.background =
                          "var(--bg-surface)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                    onClick={() => onSelect(server)}
                  >
                    {/* 图标 */}
                    <div
                      className="relative flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
                      style={{ background: "var(--bg-surface)" }}
                    >
                      <ServerIcon
                        className="w-3.5 h-3.5"
                        style={{ color: active ? "var(--accent-text)" : "var(--text-soft)" }}
                      />
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border"
                        style={{ background: "#3fb950", borderColor: "var(--bg-panel)" }}
                      />
                    </div>

                    {/* 名称 */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-medium truncate"
                        style={{ color: active ? "var(--accent-text)" : "var(--text-base)" }}
                      >
                        {server.name}
                      </p>
                      <p
                        className="text-[10px] truncate mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {server.host}:{server.port}
                      </p>
                    </div>

                    {/* 操作（hover 显示） */}
                    <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                      <button
                        className="p-1 rounded transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            "var(--bg-surface)";
                          (e.currentTarget as HTMLButtonElement).style.color =
                            "var(--text-base)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          (e.currentTarget as HTMLButtonElement).style.color =
                            "var(--text-muted)";
                        }}
                        onClick={(e) => { e.stopPropagation(); onEdit(server); }}
                        title="编辑"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        className="p-1 rounded transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            "rgba(248,81,73,0.15)";
                          (e.currentTarget as HTMLButtonElement).style.color = "#f85149";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          (e.currentTarget as HTMLButtonElement).style.color =
                            "var(--text-muted)";
                        }}
                        onClick={(e) => { e.stopPropagation(); onDelete(server.id); }}
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 添加服务器 */}
      <div className="p-2.5 border-t" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2
            text-white text-xs font-medium rounded-lg transition-colors"
          style={{ background: "var(--accent)" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(1)")
          }
        >
          <Plus className="w-3.5 h-3.5" />
          添加服务器
        </button>
      </div>
    </div>
  );
}
