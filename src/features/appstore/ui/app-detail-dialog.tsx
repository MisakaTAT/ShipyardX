import { useEffect, useState, useCallback } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { CheckCircle2, Circle, Globe, Loader2, Stone, XCircle } from 'lucide-react'
import { useAppDetail, useInstallApp } from '@/features/appstore/api/use-appstore'
import { translateStep } from '@/features/appstore/model/install-step'
import { FormFieldLabel, FormFieldRow } from '@/shared/components/form-field'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { toast } from '@/shared/components/toast'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Input } from '@/shared/ui/input'
import type {
  AppVersionInfo_Serialize,
  FormField_Serialize,
  InstallStepEvent,
  ServerConfig,
} from '@/types/app-bindings'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { CodeViewer } from '@/shared/components/code-viewer'
import { HighlightLog } from '@/features/appstore/ui/highlight-log'
import { MarkdownViewer } from '@/features/appstore/ui/markdown-viewer'
import { pickAppReadme, pickAppShortDesc, pickAppTags } from '@/features/appstore/model/app-locale'

const STEP_LABEL_KEYS: Record<string, `ui.appstore.step${'Prepare' | 'Deploy' | 'Network' | 'Start'}`> = {
  prepare: 'ui.appstore.stepPrepare',
  deploy: 'ui.appstore.stepDeploy',
  network: 'ui.appstore.stepNetwork',
  start: 'ui.appstore.stepStart',
}

function buildDefaultContainerName(appKey: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  const shortId = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 6)
  return `shipyardx-${appKey}-${shortId}`
}

const CONTAINER_NAME_FIELD: FormField_Serialize = {
  envKey: 'CONTAINER_NAME',
  default: '',
  label: {
    zh: '容器名称',
    en: 'Container name',
    ja: 'コンテナ名',
    'zh-Hant': '',
    'pt-br': '',
    'es-es': '',
    ko: '',
    ru: '',
  },
  required: true,
  type: 'text',
  values: [],
  random: false,
  rule: 'containerName',
}

interface AppDetailDialogProps {
  sourceId: string | null
  appKey: string | null
  servers: ServerConfig[]
  mode: 'readme' | 'install'
  onClose: () => void
}

export function AppDetailDialog({ sourceId, appKey, servers, mode, onClose }: AppDetailDialogProps) {
  const { t, i18n } = useTranslation()
  const { data: detail, isLoading } = useAppDetail(sourceId, appKey)
  const install = useInstallApp()
  const [selectedVersion, setSelectedVersion] = useState<AppVersionInfo_Serialize | null>(null)
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [installSteps, setInstallSteps] = useState<Map<string, InstallStepEvent>>(new Map())
  const [stepOutputs, setStepOutputs] = useState<Map<string, string[]>>(new Map())
  const form = useForm<Record<string, string>>({
    defaultValues: {
      CONTAINER_NAME: appKey ? buildDefaultContainerName(appKey) : '',
    },
    mode: 'onSubmit',
  })
  const {
    control,
    reset,
    formState: { errors },
  } = form

  const versionFields = selectedVersion
    ? selectedVersion.form_fields.some((field) => field.envKey === 'CONTAINER_NAME')
      ? [
          ...selectedVersion.form_fields.filter((field) => field.envKey === 'CONTAINER_NAME'),
          ...selectedVersion.form_fields.filter((field) => field.envKey !== 'CONTAINER_NAME'),
        ]
      : [CONTAINER_NAME_FIELD, ...selectedVersion.form_fields]
    : []

  // 监听安装步骤事件
  useEffect(() => {
    const unlisten = listen<InstallStepEvent>('install-step-event', (event) => {
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
    if (!open && install.isPending) {
      return
    }
    if (!open) {
      setSelectedVersion(null)
      setSelectedServerId('')
      reset({ CONTAINER_NAME: appKey ? buildDefaultContainerName(appKey) : '' })
      resetInstall()
      install.reset()
      onClose()
    }
  }

  const handleInstall = (values: Record<string, string>) => {
    if (!detail || !selectedVersion || !selectedServerId) return

    resetInstall()
    install.mutate({
      serverId: selectedServerId,
      req: {
        server_id: selectedServerId,
        app_key: detail.key,
        version: selectedVersion.version,
        env_values: values,
      },
    })
  }

  const submitInstallWithToast = createToastFormSubmit(
    form,
    async (values) => {
      if (!selectedServerId) {
        toast.warning(t('ui.appstore.selectServer'))
        return
      }
      handleInstall(values)
    },
    t('ui.appstore.installFailed')
  )

  const isLoadingContent = isLoading || !detail
  const readme = detail ? pickAppReadme(detail, i18n.language) : ''

  return (
    <StandardDialog
      open={!!appKey}
      onOpenChange={handleOpenChange}
      title={isLoadingContent ? t('ui.appstore.loadingTitle') : detail.name}
      icon={Stone}
      widthClassName="w-[640px]"
      disableClose={install.isPending}
      footer={
        mode === 'readme' ? null : install.isSuccess || install.isError ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              {t('ui.common.close')}
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
                <option value="">{t('ui.appstore.selectServerPlaceholder')}</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.host})
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => void submitInstallWithToast()} disabled={install.isPending || !selectedServerId}>
              {install.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {t('ui.common.install')}
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
                {pickAppShortDesc(detail, i18n.language)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {pickAppTags(detail, i18n.language).map((tag) => (
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
                {t('ui.appstore.website')}
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
          {readme ? <MarkdownViewer content={readme} /> : null}
        </div>
      ) : install.isPending || install.isSuccess || install.isError ? (
        /* 安装进度 / 结果 */
        <div>
          {['prepare', 'deploy', 'network', 'start'].map((stepKey) => {
            const step = installSteps.get(stepKey)
            const labelKey = STEP_LABEL_KEYS[stepKey]
            const label = labelKey ? t(labelKey) : stepKey
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
                  {step?.message_code && !hasOutput && (
                    <span className="ml-auto max-w-50 truncate text-[11px]">
                      {translateStep(step.message_code, step.params)}
                    </span>
                  )}
                </div>
                {/* 实时输出日志 */}
                {hasOutput && <HighlightLog outputs={outputs} />}
              </div>
            )
          })}
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submitInstallWithToast}>
          {/* Version selection */}
          <div>
            <FormFieldLabel className="mb-2">{t('ui.appstore.selectVersion')}</FormFieldLabel>
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
                    const defaults: Record<string, string> = {
                      CONTAINER_NAME: buildDefaultContainerName(detail.key),
                    }
                    for (const field of v.form_fields) {
                      if (field.default) {
                        defaults[field.envKey] = field.default
                      }
                    }
                    reset(defaults)
                  }}
                >
                  {v.version}
                </button>
              ))}
            </div>
          </div>

          {/* Config form */}
          {selectedVersion && versionFields.length > 0 && (
            <div className="space-y-3">
              {versionFields.map((field) => (
                <FormFieldInput key={field.envKey} field={field} control={control} error={errors[field.envKey]} />
              ))}
            </div>
          )}

          {/* Docker Compose 配置 */}
          {selectedVersion && (
            <div>
              <FormFieldLabel className="mb-2">Compose</FormFieldLabel>
              <div className="overflow-hidden rounded-lg border border-border" style={{ background: '#1e1e1e' }}>
                <CodeViewer
                  height="260px"
                  language="yaml"
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
        </form>
      )}
    </StandardDialog>
  )
}

function pickFieldLabel(field: FormField_Serialize, language: string) {
  const localized = language.startsWith('ja')
    ? field.label?.ja
    : language.startsWith('zh')
      ? field.label?.zh
      : field.label?.en
  return localized || field.label?.en || field.label?.zh || field.envKey
}

function FormFieldInput({
  field,
  control,
  error,
}: {
  field: FormField_Serialize
  control: ReturnType<typeof useForm<Record<string, string>>>['control']
  error: { message?: string } | undefined
}) {
  const { t, i18n } = useTranslation()
  const label = pickFieldLabel(field, i18n.language)
  const isPassword = field.type === 'password'
  const fieldType = isPassword ? 'password' : 'text'
  const placeholder =
    field.envKey === 'CONTAINER_NAME' ? t('ui.appstore.containerNamePlaceholder') : field.default || ''

  if (field.type === 'select' || field.values?.length > 0) {
    return (
      <FormFieldRow label={label} required={field.required} invalid={!!error} className="gap-1.5">
        <Controller
          control={control}
          name={field.envKey}
          rules={field.required ? { required: t('ui.appstore.fieldRequired', { label }) } : undefined}
          render={({ field: formField }) => (
            <select
              value={formField.value || ''}
              onChange={(e) => formField.onChange(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">{t('ui.common.selectPlaceholder')}</option>
              {field.values.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
        />
      </FormFieldRow>
    )
  }

  return (
    <FormFieldRow label={label} required={field.required} invalid={!!error} className="gap-1.5">
      <Controller
        control={control}
        name={field.envKey}
        rules={field.required ? { required: t('ui.appstore.fieldRequired', { label }) } : undefined}
        render={({ field: formField }) => <Input type={fieldType} {...formField} placeholder={placeholder} />}
      />
    </FormFieldRow>
  )
}
