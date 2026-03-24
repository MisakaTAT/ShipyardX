import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Box,
  Layers,
  Terminal,
  Server as ServerIcon,
  Settings,
  Sun,
  Moon,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Server } from "./types";
import ServerModal from "./components/ServerModal";
import ContainerPanel from "./components/ContainerPanel";
import ImagePanel from "./components/ImagePanel";
import TerminalPanel from "./components/TerminalPanel";
import ServerOverview from "./components/ServerOverview";

type Tab = "overview" | "containers" | "images" | "terminal";
type Page = "connect" | "workspace";

interface NavItem {
  key: Tab;
  icon: React.ReactNode;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "overview", icon: <ServerIcon size={18} />, label: "概览" },
  { key: "containers", icon: <Box size={18} />, label: "容器" },
  { key: "images", icon: <Layers size={18} />, label: "镜像" },
  { key: "terminal", icon: <Terminal size={18} />, label: "终端" },
];

export default function App() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [page, setPage] = useState<Page>("connect");
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [light, setLight] = useState(() => localStorage.getItem("theme") === "light");

  // 主题切换
  useEffect(() => {
    const root = document.documentElement;
    if (light) { root.classList.add("theme-light"); localStorage.setItem("theme", "light"); }
    else       { root.classList.remove("theme-light"); localStorage.setItem("theme", "dark"); }
  }, [light]);

  useEffect(() => {
    invoke<Server[]>("get_servers").then(setServers).catch(console.error);
  }, []);

  const handleSave = (updated: Server[]) => {
    setServers(updated);
    if (editingServer) {
      const refreshed = updated.find((s) => s.id === editingServer.id);
      if (refreshed) setSelectedServer(refreshed);
    }
  };

  const handleEdit = (server: Server) => { setEditingServer(server); setShowModal(true); };
  const handleAdd = () => { setEditingServer(null); setShowModal(true); };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此服务器配置？")) return;
    try {
      const updated = await invoke<Server[]>("delete_server", { id });
      setServers(updated);
      if (selectedServer?.id === id) {
        setSelectedServer(null);
        setPage("connect");
      }
    } catch (e) { console.error(e); }
  };

  const handleConnect = (server: Server) => {
    setSelectedServer(server);
    setActiveTab("overview");
    setPage("workspace");
  };

  return (
    <div className="flex h-screen overflow-hidden select-none"
         style={{ background: "var(--bg-app)", color: "var(--text-base)" }}>
      <nav
        className="w-14 flex flex-col items-center shrink-0 py-3 border-r"
        style={{ background: "var(--bg-nav)", borderColor: "var(--border)" }}
      >
        <div className="flex flex-col gap-1 w-full px-2">
          <NavBtn
            icon={<ServerIcon size={18} />}
            label="连接页"
            active={page === "connect"}
            onClick={() => setPage("connect")}
          />
          <NavBtn
            icon={<Box size={18} />}
            label="容器工作区"
            active={page === "workspace"}
            disabled={!selectedServer}
            onClick={() => setPage("workspace")}
          />
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-1 w-full px-2 pb-1">
          <NavBtn
            icon={
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            }
            label="GitHub"
            onClick={() => openUrl("https://github.com").catch(() => {})}
          />
          <NavBtn
            icon={light ? <Moon size={18} /> : <Sun size={18} />}
            label={light ? "切换深色" : "切换浅色"}
            onClick={() => setLight((v) => !v)}
          />
          <NavBtn
            icon={<Settings size={18} />}
            label="设置"
            onClick={() => {}}
          />
        </div>
      </nav>

      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--bg-app)" }}>
        {page === "connect" ? (
          <ConnectPage
            servers={servers}
            light={light}
            onToggleTheme={() => setLight((v) => !v)}
            onOpenGithub={() => openUrl("https://github.com").catch(() => {})}
            onConnect={handleConnect}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : selectedServer ? (
          <WorkspacePage
            selectedServer={selectedServer}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
          />
        ) : (
          <ConnectPage
            servers={servers}
            light={light}
            onToggleTheme={() => setLight((v) => !v)}
            onOpenGithub={() => openUrl("https://github.com").catch(() => {})}
            onConnect={handleConnect}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </main>

      {showModal && (
        <ServerModal
          server={editingServer}
          onClose={() => { setShowModal(false); setEditingServer(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function WorkspacePage({
  selectedServer,
  activeTab,
  onSelectTab,
}: {
  selectedServer: Server;
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
}) {
  return (
    <div className="flex-1 overflow-auto p-2 md:p-3">
      <div className="h-full flex flex-col gap-3">
        <div
          className="shrink-0 rounded-xl border px-2 py-1.5 flex items-center gap-1 flex-wrap"
          style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors"
              style={
                activeTab === item.key
                  ? {
                      background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                      color: "var(--accent-text)",
                    }
                  : { color: "var(--text-soft)" }
              }
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div
          className={`flex-1 min-h-[360px] overflow-hidden ${
            activeTab === "overview" ? "" : "rounded-xl border"
          }`}
          style={
            activeTab === "overview"
              ? { background: "transparent" }
              : { borderColor: "var(--border)", background: "var(--bg-panel)" }
          }
        >
          {activeTab === "overview" && (
            <ServerOverview serverId={selectedServer.id} />
          )}
          {activeTab === "containers" && (
            <ContainerPanel serverId={selectedServer.id} />
          )}
          {activeTab === "images" && (
            <ImagePanel serverId={selectedServer.id} />
          )}
          {activeTab === "terminal" && (
            <TerminalPanel
              serverId={selectedServer.id}
              serverName={`${selectedServer.username}@${selectedServer.host}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function NavBtn({
  icon, label, active, onClick, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={active
        ? { background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent-text)" }
        : { color: "var(--text-muted)" }
      }
      className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-all ${
        disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
      }`}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-base)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
        }
      }}
    >
      {icon}
    </button>
  );
}

function ConnectPage({
  servers,
  light,
  onToggleTheme,
  onOpenGithub,
  onConnect,
  onAdd,
  onEdit,
  onDelete,
}: {
  servers: Server[];
  light: boolean;
  onToggleTheme: () => void;
  onOpenGithub: () => void;
  onConnect: (server: Server) => void;
  onAdd: () => void;
  onEdit: (server: Server) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)", background: "var(--bg-panel)" }}>
        <div>
          <h1 className="text-base font-semibold" style={{ color: "var(--text-strong)" }}>连接服务器</h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>请选择一个服务器连接，连接后进入容器管理页面。</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenGithub} className="px-3 py-1.5 text-xs rounded-lg border" style={{ borderColor: "var(--border-sub)", color: "var(--text-soft)" }}>
            GitHub
          </button>
          <button onClick={onToggleTheme} className="p-1.5 rounded-lg border" style={{ borderColor: "var(--border-sub)", color: "var(--text-soft)" }}>
            {light ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <button onClick={onAdd} className="px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-500 text-white flex items-center gap-1.5">
            <Plus size={14} />
            添加服务器
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {servers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <ServerIcon size={34} style={{ color: "var(--border-sub)" }} />
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>暂无服务器，先添加一个连接配置。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <div key={server.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-panel)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "var(--text-strong)" }}>{server.name}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {server.username}@{server.host}:{server.port}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: "var(--border-sub)", color: "var(--text-soft)" }}>
                    {server.auth_type === "key" ? "SSH Key" : "密码"}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(server)}
                      className="p-1.5 rounded-md"
                      title="编辑"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(server.id)}
                      className="p-1.5 rounded-md"
                      title="删除"
                      style={{ color: "#f85149" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <button
                    onClick={() => onConnect(server)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    连接
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
