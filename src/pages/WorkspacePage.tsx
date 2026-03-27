import {
  Box,
  Layers,
  Terminal,
  Server as ServerIcon,
} from "lucide-react";
import type { Server } from "../types";
import ContainerPanel from "../components/ContainerPanel";
import ImagePanel from "../components/ImagePanel";
import TerminalPanel from "../components/TerminalPanel";
import ServerOverview from "../components/ServerOverview";

type Tab = "overview" | "containers" | "images" | "terminal";

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

interface WorkspacePageProps {
  selectedServer: Server;
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
}

export default function WorkspacePage({
  selectedServer,
  activeTab,
  onSelectTab,
}: WorkspacePageProps) {
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
