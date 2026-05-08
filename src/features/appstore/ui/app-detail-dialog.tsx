import { useEffect, useState } from 'react'
import { Globe, Loader2, ServerIcon, Store } from 'lucide-react'
import { useAppDetail, useInstallApp, type FormField, type AppVersionInfo } from '@/features/appstore/api/use-appstore'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import type { ServerConfig } from '@/types/app-bindings'

const TAG_LABELS: Record<string, string> = {
  Tool: '工具',
  Runtime: '运行时',
  Website: '网站',
  Database: '数据库',
  Storage: '存储',
  Monitoring: '监控',
  AI: 'AI',
  VPN: 'VPN',
  CMS: 'CMS',
  DevOps: 'DevOps',
  Security: '安全',
  Media: '媒体',
  Game: '游戏',
  Other: '其他',
}

interface AppDetailDialogProps {
  appKey: string | null
  servers: ServerConfig[]
  onClose: () => void
}

export function AppDetailDialog({ appKey, servers, onClose }: AppDetailDialogProps) {
  const { data: detail, isLoading } = useAppDetail(appKey)
  const install = useInstallApp()
  const [selectedVersion, setSelectedVersion] = useState<AppVersionInfo | null>(null)
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  // 自动预选第一台服务器（必须在条件返回之前调用）
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
      onClose()
    }
  }

  const handleInstall = () => {
    if (!detail || !selectedVersion || !selectedServerId) return

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
      icon={Store}
      widthClassName="w-[640px]"
      footer={
        selectedVersion ? (
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1.5">
              <ServerIcon className="size-3.5 text-muted-foreground" />
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
            <Button onClick={handleInstall} disabled={install.isPending || !selectedServerId} size="sm">
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
      ) : (
        <div className="space-y-4">
          {/* Header info */}
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
                    {TAG_LABELS[tag] || tag}
                  </Badge>
                ))}
                {detail.installed && (
                  <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    已安装
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Links */}
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

          {/* README preview */}
          {detail.readme_zh && (
            <div className="max-h-40 overflow-auto rounded-lg border border-border bg-muted/30 p-3">
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {detail.readme_zh.slice(0, 2000)}
                {detail.readme_zh.length > 2000 ? '...' : ''}
              </pre>
            </div>
          )}

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
                        defaults[field.env_key] = field.default
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
                    key={field.env_key}
                    field={field}
                    value={formValues[field.env_key] || ''}
                    onChange={(v) => handleValueChange(field.env_key, v)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Docker Compose preview */}
          {selectedVersion && (
            <div>
              <h4 className="mb-2 text-[13px] font-medium text-foreground">Docker Compose 配置</h4>
              <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted p-3">
                <code className="text-[11px] leading-relaxed text-muted-foreground">
                  {selectedVersion.compose_preview}
                </code>
              </pre>
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
  field: FormField
  value: string
  onChange: (value: string) => void
}) {
  const label = field.label?.zh || field.label?.en || field.env_key
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
