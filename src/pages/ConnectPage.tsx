import { useState } from "react";
import {
  Server as ServerIcon,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  KeyRound,
  Lock,
  ArrowRight,
} from "lucide-react";
import type { Server } from "../types";

interface ConnectPageProps {
  servers: Server[];
  onConnect: (server: Server) => void;
  onAdd: () => void;
  onEdit: (server: Server) => void;
  onDelete: (id: string) => void;
}

export default function ConnectPage({
  servers,
  onConnect,
  onAdd,
  onEdit,
  onDelete,
}: ConnectPageProps) {
  const [search, setSearch] = useState("");

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.host.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex-1 overflow-auto p-2 md:p-3">
      <div className="h-full flex flex-col gap-3">
      <div className="shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "var(--text-strong)" }}>
              服务器
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              管理远程服务器连接，选择一个服务器进入工作区。
            </p>
          </div>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.15)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
          >
            <Plus size={14} strokeWidth={2.5} />
            添加服务器
          </button>
        </div>

        {servers.length > 0 && (
          <div className="relative mt-4">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索服务器名称或地址…"
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border outline-none transition-colors"
              style={{
                background: "var(--bg-input)",
                borderColor: "var(--border-sub)",
                color: "var(--text-base)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border-sub)")}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {servers.length === 0 ? (
          <EmptyState onAdd={onAdd} />
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Search size={28} style={{ color: "var(--border-sub)" }} />
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              没有找到匹配的服务器
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onConnect={() => onConnect(server)}
                onEdit={() => onEdit(server)}
                onDelete={() => onDelete(server.id)}
              />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function ServerCard({
  server,
  onConnect,
  onEdit,
  onDelete,
}: {
  server: Server;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group relative rounded-xl border overflow-hidden transition-colors duration-200 cursor-pointer"
      style={{ borderColor: "var(--border)", background: "var(--bg-panel)" }}
      onClick={onConnect}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-surface)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-panel)";
      }}
    >
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
          >
            <ServerIcon size={15} style={{ color: "var(--accent-text)" }} />
          </div>
          <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: "var(--bg-surface)", color: "var(--text-soft)" }}
          >
            {server.auth_type === "key" ? <KeyRound size={9} /> : <Lock size={9} />}
            {server.auth_type === "key" ? "密钥" : "密码"}
          </span>
        </div>

        <h3
          className="text-[13px] font-semibold truncate leading-tight"
          style={{ color: "var(--text-strong)" }}
        >
          {server.name}
        </h3>
        <p
          className="text-[11px] mt-1 font-mono truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {server.username}@{server.host}:{server.port}
        </p>
      </div>

      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ background: "color-mix(in srgb, var(--bg-surface) 50%, transparent)" }}
      >
        <div
          className="flex items-center gap-1 invisible group-hover:visible"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn icon={<Pencil size={12} />} label="编辑" onClick={onEdit} />
          <ActionBtn icon={<Trash2 size={12} />} label="删除" onClick={onDelete} danger />
        </div>

        <div
          className="flex items-center gap-1 text-[11px] font-medium"
          style={{ color: "var(--accent-text)" }}
        >
          连接
          <ArrowRight size={12} />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="p-1.5 rounded-md cursor-pointer"
      style={{ color: "var(--text-muted)" }}
      onMouseEnter={(e) => {
        if (danger) {
          e.currentTarget.style.background = "rgba(248,81,73,0.1)";
          e.currentTarget.style.color = "#f85149";
        } else {
          e.currentTarget.style.background = "var(--bg-panel)";
          e.currentTarget.style.color = "var(--text-base)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {icon}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-xs">
        <div
          className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
        >
          <ServerIcon size={28} style={{ color: "var(--accent-text)" }} />
        </div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-strong)" }}>
          还没有服务器
        </h2>
        <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
          添加你的第一个远程服务器连接，开始管理 Docker 容器和镜像。
        </p>
        <button
          onClick={onAdd}
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
        >
          <Plus size={14} strokeWidth={2.5} />
          添加服务器
        </button>
      </div>
    </div>
  );
}
