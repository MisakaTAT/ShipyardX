import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Box, Layers, Terminal, Server as ServerIcon, Settings, Sun, Moon } from "lucide-react";
import type { Server } from "./types";
import Sidebar from "./components/Sidebar";
import ServerModal from "./components/ServerModal";
import ContainerPanel from "./components/ContainerPanel";
import ImagePanel from "./components/ImagePanel";
import TerminalPanel from "./components/TerminalPanel";
import ServerOverview from "./components/ServerOverview";

type Tab = "containers" | "images" | "terminal";

interface NavItem {
  key: Tab;
  icon: React.ReactNode;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "containers", icon: <Box size={18} />, label: "容器" },
  { key: "images", icon: <Layers size={18} />, label: "镜像" },
  { key: "terminal", icon: <Terminal size={18} />, label: "终端" },
];

export default function App() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("containers");
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
      if (selectedServer?.id === id) setSelectedServer(null);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex h-screen overflow-hidden select-none"
         style={{ background: "var(--bg-app)", color: "var(--text-base)" }}>

      {/* ── 列 1: 图标导航栏 ── */}
      <nav className="w-14 flex flex-col items-center shrink-0 py-3 border-r"
           style={{ background: "var(--bg-nav)", borderColor: "var(--border)" }}>
        {/* 服务器列表入口（始终 active，因为第二列就是服务器列表） */}
        <div className="flex flex-col gap-1 w-full px-2">
          <NavBtn
            icon={<ServerIcon size={18} />}
            label="服务器列表"
            active={true}
            onClick={() => {}}
          />
        </div>

        <div className="flex-1" />

        {/* 底部：GitHub + 主题切换 + 设置 */}
        <div className="flex flex-col gap-1 w-full px-2 pb-1">
          <NavBtn
            icon={
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            }
            label="GitHub"
            active={false}
            onClick={() => openUrl("https://github.com").catch(() => {})}
          />
          <NavBtn
            icon={light ? <Moon size={18} /> : <Sun size={18} />}
            label={light ? "切换深色" : "切换浅色"}
            active={false}
            onClick={() => setLight(v => !v)}
          />
          <NavBtn
            icon={<Settings size={18} />}
            label="设置"
            active={false}
            onClick={() => {}}
          />
        </div>
      </nav>

      {/* ── 列 2: 服务器列表 ── */}
      <Sidebar
        servers={servers}
        selectedId={selectedServer?.id ?? null}
        onSelect={(s) => { setSelectedServer(s); setActiveTab("containers"); }}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* ── 列 3: 主内容 ── */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--bg-app)" }}>
        {selectedServer ? (
          <>
            {/* 顶部服务器标题 */}
            <header className="flex items-center justify-between px-5 py-2.5 shrink-0 border-b"
                    style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-[#1f6feb]/20 rounded-lg flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-[#e6edf3] leading-none">
                    {selectedServer.name}
                  </h1>
                  <p className="text-[11px] text-[#6e7681] mt-0.5">
                    {selectedServer.username}@{selectedServer.host}:{selectedServer.port}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#21262d] text-[#8b949e] border border-[#30363d]">
                  {selectedServer.auth_type === "key" ? "SSH Key" : "密码认证"}
                </span>
                <button
                  onClick={() => handleEdit(selectedServer)}
                  className="p-1.5 rounded-lg text-[#6e7681] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
                  title="编辑配置"
                >
                  <Settings size={14} />
                </button>
              </div>
            </header>

            {/* 服务器概览（可折叠统计网格） */}
            <ServerOverview serverId={selectedServer.id} />

            {/* Tab 栏 */}
            <div className="flex items-center gap-0.5 px-4 shrink-0 border-b"
                 style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}>
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors
                    ${activeTab === item.key
                      ? "border-[#1f6feb] text-[#58a6ff]"
                      : "border-transparent text-[#8b949e] hover:text-[#c9d1d9]"
                    }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-hidden">
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
          </>
        ) : (
          <EmptyState onAdd={handleAdd} />
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

// ── 导航图标按钮 ──
function NavBtn({
  icon, label, active, onClick, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
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
      className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-all
        ${!active ? "hover:bg-[var(--bg-surface)] hover:!text-[var(--text-base)]" : ""}
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {icon}
    </button>
  );
}

// ── 空状态 ──
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 bg-[#161b22] border border-[#30363d] rounded-2xl flex items-center justify-center mb-5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-[#e6edf3] mb-2">欢迎使用 ShipyardX</h2>
      <p className="text-sm text-[#6e7681] mb-6 max-w-xs leading-relaxed">
        通过 SSH 远程管理服务器上的 Docker 容器与镜像。从左侧添加第一台服务器开始。
      </p>
      <button
        onClick={onAdd}
        className="px-5 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium rounded-lg transition-colors"
      >
        添加服务器
      </button>
      <div className="mt-8 grid grid-cols-3 gap-3 max-w-sm">
        {[
          { icon: <Box size={16} />, label: "容器管理", desc: "启动、停止、重启、监控" },
          { icon: <Layers size={16} />, label: "镜像管理", desc: "拉取、查看、删除镜像" },
          { icon: <Terminal size={16} />, label: "SSH 终端", desc: "直接进入远程终端" },
        ].map((f) => (
          <div key={f.label} className="flex flex-col items-center gap-2 p-3 bg-[#161b22] rounded-xl border border-[#21262d]">
            <div className="text-[#58a6ff]">{f.icon}</div>
            <div className="text-xs font-medium text-[#c9d1d9]">{f.label}</div>
            <div className="text-[11px] text-[#6e7681] text-center leading-relaxed">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
