import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, Circle, Globe, Loader2, Stone, XCircle } from 'lucide-react'
import { useAppDetail, useInstallApp } from '@/features/appstore/api/use-appstore'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import type { AppVersionInfo_Serialize, FormField_Serialize, ServerConfig } from '@/types/app-bindings'
import { listen } from '@tauri-apps/api/event'
import Editor from '@monaco-editor/react'
import { HighlightLog } from '@/features/appstore/ui/highlight-log'
import { MarkdownViewer } from '@/features/appstore/ui/markdown-viewer'

interface InstallStep {
  step: string
  status: string
  message: string
  output_chunk?: string
}

const STEP_LABELS: Record<string, string> = {
  prepare: '准备部署模板',
  deploy: '部署文件',
  network: '创建网络',
  start: '启动容器',
}

interface AppDetailDialogProps {
  appKey: string | null
  servers: ServerConfig[]
  mode: 'readme' | 'install'
  onClose: () => void
}

export function AppDetailDialog({ appKey, servers, mode, onClose }: AppDetailDialogProps) {
  const { data: detail, isLoading } = useAppDetail(appKey)
  const install = useInstallApp()
  const [selectedVersion, setSelectedVersion] = useState<AppVersionInfo_Serialize | null>(null)
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [installSteps, setInstallSteps] = useState<Map<string, InstallStep>>(new Map())
  const [stepOutputs, setStepOutputs] = useState<Map<string, string[]>>(new Map())

  // 监听安装步骤事件
  useEffect(() => {
    const unlisten = listen<InstallStep>('install-step-event', (event) => {
      const payload = event.payload
      if (payload.output_chunk) {
        // 流式输出片段
        setStepOutputs((prev) => {
          const next = new Map(prev)
          const existing = next.get(payload.step) || []
          next.set(payload.step, [...existing, payload.output_chunk!])
          return next
        })
      } else if (payload.step) {
        // 状态变更
        setInstallSteps((prev) => {
          const next = new Map(prev)
          next.set(payload.step, payload)
          return next
        })
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  // 重置安装状态
  const resetInstall = useCallback(() => {
    setInstallSteps(new Map())
    setStepOutputs(new Map())
  }, [])

  // 自动预选第一台服务器
  useEffect(() => {
    if (appKey && servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers[0].id)
    }
  }, [appKey, servers, selectedServerId])

  if (!appKey) return null

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedVersion(null)
      setSelectedServerId('')
      setFormValues({})
      resetInstall()
      install.reset()
      onClose()
    }
  }

  const handleInstall = () => {
    if (!detail || !selectedVersion || !selectedServerId) return

    resetInstall()
    install.mutate({
      serverId: selectedServerId,
      req: {
        server_id: selectedServerId,
        app_key: detail.key,
        version: selectedVersion.version,
        env_values: formValues,
      },
    })
  }

  const handleValueChange = (envKey: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [envKey]: value }))
  }

  const isLoadingContent = isLoading || !detail

  return (
    <StandardDialog
      open={!!appKey}
      onOpenChange={handleOpenChange}
      title={isLoadingContent ? '加载中...' : detail.name}
      icon={Stone}
      widthClassName="w-[640px]"
      footer={
        mode === 'readme' ? null : install.isSuccess || install.isError ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              关闭
            </Button>
          </div>
        ) : selectedVersion ? (
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              >
                <option value="">选择服务器...</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.host})
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={handleInstall} disabled={install.isPending || !selectedServerId}>
              {install.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              安装
            </Button>
          </div>
        ) : null
      }
    >
      {isLoadingContent ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : mode === 'readme' ? (
        /* Readme 浏览 */
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {detail.icon && (
              <img
                src={`data:image/png;base64,${detail.icon}`}
                alt={detail.name}
                className="size-11 shrink-0 rounded-lg"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {detail.short_desc_zh || detail.short_desc_en}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {detail.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {detail.website && (
              <a
                href={detail.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                <Globe className="size-3.5" />
                官网
              </a>
            )}
            {detail.github && (
              <a
                href={detail.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                GitHub
              </a>
            )}
          </div>
          {detail.readme_zh && <MarkdownViewer content={detail.readme_zh} />}
        </div>
      ) : install.isPending || install.isSuccess || install.isError ? (
        /* 安装进度 / 结果 */
        <div>
          {['prepare', 'deploy', 'network', 'start'].map((stepKey) => {
            const step = installSteps.get(stepKey)
            const label = STEP_LABELS[stepKey] || stepKey
            const isRunning = step?.status === 'running'
            const isDone = step?.status === 'done'
            const isError = step?.status === 'error'
            const outputs = stepOutputs.get(stepKey) || []
            const hasOutput = outputs.length > 0
            return (
              <div key={stepKey}>
                <div
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-xs transition-colors ${
                    isRunning ? 'bg-accent text-foreground' : ''
                  }${isError ? 'bg-red-500/10 text-red-600 dark:text-red-400' : ''}${
                    isDone ? 'text-muted-foreground' : ''
                  }${!step ? 'text-muted-foreground/40' : ''}`}
                >
                  {isDone ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                  ) : isError ? (
                    <XCircle className="size-3.5 shrink-0 text-red-500" />
                  ) : isRunning ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Circle className="size-3.5 shrink-0" />
                  )}
                  <span>{label}</span>
                  {step?.message && !hasOutput && (
                    <span className="ml-auto max-w-[200px] truncate text-[11px]">{step.message}</span>
                  )}
                </div>
                {/* 实时输出日志 */}
                {hasOutput && <HighlightLog outputs={outputs} />}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Version selection */}
          <div>
            <h4 className="mb-2 text-[13px] font-medium text-foreground">选择版本</h4>
            <div className="grid grid-cols-3 gap-2">
              {detail.versions.map((v) => (
                <button
                  key={v.version}
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedVersion?.version === v.version
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/30 hover:bg-accent'
                  }`}
                  onClick={() => {
                    setSelectedVersion(v)
                    const defaults: Record<string, string> = {}
                    for (const field of v.form_fields) {
                      if (field.default) {
                        defaults[field.envKey] = field.default
                      }
                    }
                    setFormValues(defaults)
                  }}
                >
                  {v.version}
                </button>
              ))}
            </div>
          </div>

          {/* Config form */}
          {selectedVersion && selectedVersion.form_fields.length > 0 && (
            <div>
              <h4 className="mb-2 text-[13px] font-medium text-foreground">配置参数</h4>
              <div className="space-y-3">
                {selectedVersion.form_fields.map((field) => (
                  <FormFieldInput
                    key={field.envKey}
                    field={field}
                    value={formValues[field.envKey] || ''}
                    onChange={(v) => handleValueChange(field.envKey, v)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Docker Compose 配置 */}
          {selectedVersion && (
            <div>
              <h4 className="mb-2 text-[13px] font-medium text-foreground">Docker Compose 配置</h4>
              <div className="overflow-hidden rounded-lg border border-border" style={{ background: '#1e1e1e' }}>
                <Editor
                  height="260px"
                  language="yaml"
                  theme="vs-dark"
                  value={selectedVersion.compose_preview}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on' as const,
                    fontSize: 12,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    tabSize: 2,
                    lineNumbers: 'on' as const,
                    renderLineHighlight: 'none' as const,
                    padding: { top: 12, bottom: 12 },
                    folding: true,
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    automaticLayout: true,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </StandardDialog>
  )
}

function FormFieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField_Serialize
  value: string
  onChange: (value: string) => void
}) {
  const label = field.label?.zh || field.label?.en || field.envKey
  const isPassword = field.type === 'password'
  const fieldType = isPassword ? 'password' : 'text'

  if (field.type === 'select' || field.values?.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">
          {label}
          {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          {field.values.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-foreground">
        {label}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        type={fieldType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.default || ''}
        className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
      />
    </div>
  )
}
