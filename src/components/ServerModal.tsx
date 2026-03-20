import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Server } from "../types";
import { X, Loader2, CheckCircle } from "lucide-react";

interface ServerModalProps {
  server?: Server | null;
  onClose: () => void;
  onSave: (servers: Server[]) => void;
}

const defaultForm = (): Omit<Server, "id"> => ({
  name: "",
  host: "",
  port: 22,
  username: "root",
  auth_type: "key",
  password: "",
  key_path: "~/.ssh/id_rsa",
});

export default function ServerModal({ server, onClose, onSave }: ServerModalProps) {
  const [form, setForm] = useState<Omit<Server, "id">>(
    server ? { ...server } : defaultForm()
  );
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [error, setError] = useState("");
  const isEdit = !!server;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const update = (key: keyof Omit<Server, "id">, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
    setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return setError("请填写服务器名称");
    if (!form.host.trim()) return setError("请填写主机地址");
    if (!form.username.trim()) return setError("请填写用户名");

    setLoading(true);
    setError("");
    try {
      let servers: Server[];
      if (isEdit && server) {
        servers = await invoke<Server[]>("update_server", {
          server: { ...form, id: server.id },
        });
      } else {
        servers = await invoke<Server[]>("add_server", {
          server: { ...form, id: "" },
        });
      }
      onSave(servers);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!form.host.trim()) return setError("请先填写主机地址");
    if (!server) {
      setError("请先保存服务器配置再测试连接");
      return;
    }
    setLoading(true);
    setTestResult(null);
    setError("");
    try {
      const msg = await invoke<string>("test_connection", { serverId: server.id });
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100">
            {isEdit ? "编辑服务器" : "添加服务器"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              服务器名称 *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="例如：生产服务器"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">主机地址 *</label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => update("host", e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">端口</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => update("port", parseInt(e.target.value) || 22)}
                min={1}
                max={65535}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">用户名 *</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder="root"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">认证方式</label>
            <div className="flex gap-2">
              {(["key", "password"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => update("auth_type", type)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.auth_type === type
                      ? "bg-blue-600 text-white"
                      : "bg-slate-900 text-slate-400 border border-slate-600 hover:border-slate-500"
                  }`}
                >
                  {type === "key" ? "SSH 密钥" : "密码"}
                </button>
              ))}
            </div>
          </div>

          {form.auth_type === "password" ? (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">密码</label>
              <input
                type="password"
                value={form.password || ""}
                onChange={(e) => update("password", e.target.value)}
                placeholder="SSH 登录密码"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">密钥路径</label>
              <input
                type="text"
                value={form.key_path || ""}
                onChange={(e) => update("key_path", e.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {testResult && (
            <div
              className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
                testResult.ok
                  ? "bg-green-900/20 border border-green-800/50 text-green-400"
                  : "bg-red-900/20 border border-red-800/50 text-red-400"
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{testResult.msg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
          {isEdit ? (
            <button
              onClick={handleTest}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              测试连接
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEdit ? "保存" : "添加"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
