import { useCallback, useEffect, useId, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Box, Play, Plus, Trash2 } from 'lucide-react'
import { commands, type Image, type Network } from '@/types/app-bindings'
import {
  runContainerFormDefaultValues,
  runContainerFormSchema,
  runFormValuesToBuildArgs,
  type RunContainerFormValues,
} from '@/features/docker-containers/model/run-container-schema'
import { buildRunParamsFromForm } from '@/features/docker-containers/lib/docker-run-cli'
import { listSelectableImageRefs } from '@/shared/lib/docker-image-ref'
import { FormFieldRow } from '@/shared/components/form-field'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/utils'
import { PullProgress } from '@/features/docker-containers/ui/run-container/pull-progress'
import { useRunContainerFlow } from '@/features/docker-containers/ui/run-container/use-run-container'
import { toastAppError } from '@/shared/lib/errors'

const SECTION_SHELL = 'space-y-2.5'
const SECTION_TITLE = 'text-sm font-semibold tracking-tight'
const SECTION_HINT = 'text-xs leading-relaxed'
const FIELD_SHELL = 'space-y-1.5'
const CHECK_ROW = 'flex cursor-pointer items-center gap-2.5 text-left text-[13px] leading-none text-foreground'
const RADIO_ROW = 'flex cursor-pointer items-center gap-2 text-[13px] text-foreground'

const RESTART_OPTIONS = [
  { value: 'no', label: '不自动重启' },
  { value: 'always', label: '始终重启' },
  { value: 'unless-stopped', label: '除非已手动停止' },
  { value: 'on-failure', label: '非零退出时重启' },
] as const

const BUILT_IN_NETWORKS = new Set(['bridge', 'host', 'none', 'default'])

function emptyKeyValueRow() {
  return { key: '', value: '' }
}

function emptyArgRow() {
  return { value: '' }
}

function emptyPort(): RunContainerFormValues['ports'][number] {
  return { containerPort: 80, hostPort: null, protocol: 'tcp' }
}

function emptyVolume(): RunContainerFormValues['volumes'][number] {
  return { hostPath: '', containerPath: '', readOnly: false }
}

function getRestartPolicyLabel(value: RunContainerFormValues['restartPolicy']) {
  return RESTART_OPTIONS.find((option) => option.value === value)?.label ?? value
}

function SectionTitle({ className, invalid, ...props }: ComponentProps<typeof FieldTitle> & { invalid?: boolean }) {
  return <FieldTitle className={cn(SECTION_TITLE, invalid ? 'text-destructive' : null, className)} {...props} />
}

function SectionHint({ className, ...props }: ComponentProps<typeof FieldDescription>) {
  return <FieldDescription className={cn(SECTION_HINT, className)} {...props} />
}

interface FormSectionProps {
  title?: ReactNode
  invalid?: boolean
  action?: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}

function FormSection({ title, invalid, action, hint, children, className }: FormSectionProps) {
  return (
    <div className={cn(SECTION_SHELL, className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3">
          <SectionTitle invalid={invalid}>{title}</SectionTitle>
          {action}
        </div>
      ) : null}
      {hint ? <SectionHint className="nth-last-2:mt-0">{hint}</SectionHint> : null}
      {children}
    </div>
  )
}

interface StackFieldProps {
  label: ReactNode
  htmlFor?: string
  invalid?: boolean
  hint?: ReactNode
  children: ReactNode
  className?: string
}

function StackField({ label, htmlFor, invalid, hint, children, className }: StackFieldProps) {
  return (
    <div className={cn(FIELD_SHELL, className)}>
      <FieldLabel htmlFor={htmlFor} className={invalid ? 'text-destructive' : undefined}>
        {label}
      </FieldLabel>
      {children}
      {hint ? <SectionHint>{hint}</SectionHint> : null}
    </div>
  )
}

interface CheckRowProps {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  children: ReactNode
}

function CheckRow({ checked, onCheckedChange, children }: CheckRowProps) {
  return (
    <label className={CHECK_ROW}>
      <Checkbox checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} />
      <span>{children}</span>
    </label>
  )
}

interface KeyValueEditorProps {
  title: string
  hint: ReactNode
  fields: Array<{ id: string }>
  invalid?: boolean
  onAdd: () => void
  onRemove: (index: number) => void
  renderKeyInput: (index: number) => ReactNode
  renderValueInput: (index: number) => ReactNode
}

function KeyValueEditor({
  title,
  hint,
  fields,
  invalid,
  onAdd,
  onRemove,
  renderKeyInput,
  renderValueInput,
}: KeyValueEditorProps) {
  return (
    <FormSection
      title={title}
      invalid={invalid}
      action={
        <Button type="button" variant="outline" size="sm" className="gap-1 px-2" onClick={onAdd}>
          <Plus className="size-3" />
          添加
        </Button>
      }
      hint={hint}
    >
      {fields.length === 0 ? (
        <SectionHint>暂未添加</SectionHint>
      ) : (
        <div className="space-y-2">
          {fields.map((row, i) => (
            <div key={row.id} className="flex flex-row items-center gap-2 rounded-lg border border-border p-1">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                {renderKeyInput(i)}
                {renderValueInput(i)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-red-500"
                onClick={() => onRemove(i)}
                aria-label={`删除${title}第 ${i + 1} 项`}
                title={`删除${title}第 ${i + 1} 项`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </FormSection>
  )
}

interface ArgListEditorProps {
  title: string
  hint: ReactNode
  mode: 'raw' | 'args'
  onModeChange: (mode: 'raw' | 'args') => void
  rawValue: string
  onRawChange: (value: string) => void
  rawPlaceholder: string
  fields: Array<{ id: string }>
  onAddArg: () => void
  onRemoveArg: (index: number) => void
  renderArgInput: (index: number) => ReactNode
}

function ArgListEditor({
  title,
  hint,
  mode,
  onModeChange,
  rawValue,
  onRawChange,
  rawPlaceholder,
  fields,
  onAddArg,
  onRemoveArg,
  renderArgInput,
}: ArgListEditorProps) {
  return (
    <FormSection title={title} hint={hint}>
      <RadioGroup value={mode} onValueChange={(value) => onModeChange(value as 'raw' | 'args')} className="flex gap-4">
        <label className={RADIO_ROW}>
          <RadioGroupItem value="raw" />
          <span>原始命令</span>
        </label>
        <label className={RADIO_ROW}>
          <RadioGroupItem value="args" />
          <span>参数列表</span>
        </label>
      </RadioGroup>
      {mode === 'raw' ? (
        <Textarea
          value={rawValue}
          onChange={(e) => onRawChange(e.target.value)}
          placeholder={rawPlaceholder}
          rows={3}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <FieldLabel>参数列表</FieldLabel>
            <Button type="button" variant="outline" size="sm" className="gap-1 px-2" onClick={onAddArg}>
              <Plus className="size-3" />
              添加参数
            </Button>
          </div>
          {fields.length === 0 ? (
            <SectionHint>暂未添加参数</SectionHint>
          ) : (
            <div className="space-y-2">
              {fields.map((row, i) => (
                <div key={row.id} className="flex items-center gap-2 rounded-lg border border-border p-1">
                  <div className="min-w-0 flex-1">{renderArgInput(i)}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-red-500"
                    onClick={() => onRemoveArg(i)}
                    aria-label={`删除${title}参数 ${i + 1}`}
                    title={`删除${title}参数 ${i + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </FormSection>
  )
}

interface RunContainerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverId: string
  onSuccess?: () => void
}

export default function RunContainerDialog({ open, onOpenChange, serverId, onSuccess }: RunContainerDialogProps) {
  const [images, setImages] = useState<Image[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [networks, setNetworks] = useState<Network[]>([])
  const [networksLoading, setNetworksLoading] = useState(false)
  const imageDatalistId = useId()

  const form = useForm<RunContainerFormValues>({
    resolver: zodResolver(runContainerFormSchema),
    defaultValues: runContainerFormDefaultValues,
    mode: 'onSubmit',
  })

  const {
    control,
    watch,
    getValues,
    setValue,
    formState: { errors },
    reset: resetForm,
  } = form

  const { fields: portFields, append: appendPort, remove: removePort } = useFieldArray({ control, name: 'ports' })
  const {
    fields: volumeFields,
    append: appendVolume,
    remove: removeVolume,
  } = useFieldArray({ control, name: 'volumes' })
  const { fields: envFields, append: appendEnv, remove: removeEnv } = useFieldArray({ control, name: 'envEntries' })
  const {
    fields: labelFields,
    append: appendLabel,
    remove: removeLabel,
  } = useFieldArray({ control, name: 'labelEntries' })
  const {
    fields: commandArgFields,
    append: appendCommandArg,
    remove: removeCommandArg,
  } = useFieldArray({ control, name: 'commandArgs' })
  const {
    fields: entrypointArgFields,
    append: appendEntrypointArg,
    remove: removeEntrypointArg,
  } = useFieldArray({ control, name: 'entrypointArgs' })

  const restartPolicy = watch('restartPolicy')
  const network = watch('network')
  const commandMode = watch('commandMode')
  const commandText = watch('commandText')
  const entrypointMode = watch('entrypointMode')
  const entrypointText = watch('entrypointText')
  const imageInvalid = !!errors.image
  const isCustomNetwork = Boolean(network.trim()) && !BUILT_IN_NETWORKS.has(network.trim().toLowerCase())

  const handleSuccess = useCallback(() => {
    onSuccess?.()
    onOpenChange(false)
  }, [onSuccess, onOpenChange])

  const flow = useRunContainerFlow(serverId, handleSuccess)

  useEffect(() => {
    if (!open) return
    flow.reset()
    resetForm(runContainerFormDefaultValues)

    let alive = true
    setImagesLoading(true)
    void commands
      .listImages(serverId)
      .then((data) => {
        if (alive) setImages(data)
      })
      .catch(() => {
        if (alive) setImages([])
      })
      .finally(() => {
        if (alive) setImagesLoading(false)
      })

    setNetworksLoading(true)
    void commands
      .listNetworks(serverId)
      .then((data) => {
        if (alive) setNetworks(data)
      })
      .catch(() => {
        if (alive) setNetworks([])
      })
      .finally(() => {
        if (alive) setNetworksLoading(false)
      })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serverId])

  const imageOptions = useMemo(() => listSelectableImageRefs(images), [images])

  const onSubmit = useCallback(
    (data: RunContainerFormValues) => {
      try {
        const params = buildRunParamsFromForm(runFormValuesToBuildArgs(data))
        flow.submit(params, data.forcePull, images)
      } catch (e) {
        toastAppError(e)
      }
    },
    [flow, images]
  )

  const submitWithToast = createToastFormSubmit(
    form,
    async (values) => {
      onSubmit(values)
    },
    '请检查容器运行配置后重试'
  )

  const progressSteps = [
    {
      status: flow.imageStep,
      title: flow.imageStepTitle || '镜像准备',
      detail: flow.imageStepDetail || undefined,
    },
    {
      status: flow.runStep,
      title: '创建并启动容器',
      detail: flow.runStep === 'active' ? '正在向 Docker 提交创建请求…' : undefined,
    },
  ]

  const showForm = flow.phase === 'form'
  const disableClose = flow.phase === 'progress' && flow.isStepActive

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
      }}
      title="运行容器"
      icon={Box}
      widthClassName="w-[680px]"
      disableClose={disableClose}
      showCloseButton={showForm}
      headerActions={
        showForm ? null : (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={flow.runStep === 'active'}
            onClick={() => void flow.handleBackFromProgress()}
          >
            {flow.imageStep === 'active' ? '中断拉取' : '返回编辑'}
          </Button>
        )
      }
      footer={
        showForm ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" form="run-container-builder-form" className="gap-1.5" disabled={imagesLoading}>
              <Play />
              运行
            </Button>
          </div>
        ) : null
      }
    >
      {showForm ? (
        <form id="run-container-builder-form" className="space-y-7" onSubmit={submitWithToast} noValidate>
          <FieldGroup>
            {/* 基础：名称 + 镜像 */}
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <FormFieldRow
                  label="容器名称"
                  htmlFor="run-ctr-name"
                  required
                  invalid={fieldState.invalid}
                  description={<SectionHint>仅支持字母数字下划线连字符与英文句点</SectionHint>}
                >
                  <Input
                    id="run-ctr-name"
                    {...field}
                    placeholder="留空将自动生成容器名称"
                    aria-invalid={fieldState.invalid}
                  />
                </FormFieldRow>
              )}
            />

            <Controller
              control={control}
              name="imageManualInput"
              render={({ field: manualField }) => (
                <Controller
                  control={control}
                  name="image"
                  render={({ field: imageField, fieldState }) => (
                    <FormFieldRow
                      label="镜像"
                      required
                      invalid={fieldState.invalid || imageInvalid}
                      variant="title"
                      className={SECTION_SHELL}
                      contentClassName="gap-2"
                      labelClassName={cn(SECTION_TITLE, fieldState.invalid || imageInvalid ? 'text-destructive' : null)}
                      description={
                        manualField.value ? (
                          <SectionHint>可联想本地列表或直接输入完整引用 本机无该标签时启动前会自动拉取</SectionHint>
                        ) : !imagesLoading && imageOptions.length === 0 ? (
                          <SectionHint>当前无本地镜像 可切换到自定输入 或先到镜像页拉取后再选</SectionHint>
                        ) : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        <Select
                          value={manualField.value ? 'manual' : 'list'}
                          onValueChange={(v) => {
                            const nextManual = v === 'manual'
                            manualField.onChange(nextManual)
                            if (nextManual) return
                            const cur = getValues('image')
                            if (cur && !imageOptions.includes(cur)) setValue('image', '')
                          }}
                          disabled={imagesLoading}
                        >
                          <SelectTrigger aria-invalid={fieldState.invalid || imageInvalid} className="w-32 shrink-0">
                            <SelectValue>{(v) => (v === 'manual' ? '自定义' : v === 'list' ? '列表' : v)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent align="start">
                            <SelectItem value="manual">自定义</SelectItem>
                            <SelectItem value="list" disabled={imageOptions.length === 0}>
                              列表
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {manualField.value ? (
                          <>
                            <Input
                              {...imageField}
                              list={imageDatalistId}
                              placeholder={
                                imagesLoading
                                  ? '正在加载本地镜像…'
                                  : '例如 nginx:alpine 或 registry.example.com/project:tag'
                              }
                              disabled={imagesLoading}
                              autoComplete="off"
                              aria-invalid={fieldState.invalid}
                              className="min-w-0 flex-1"
                            />
                            <datalist id={imageDatalistId}>
                              {imageOptions.map((ref) => (
                                <option key={ref} value={ref} />
                              ))}
                            </datalist>
                          </>
                        ) : (
                          <Select
                            value={
                              imageField.value && imageOptions.includes(imageField.value) ? imageField.value : undefined
                            }
                            onValueChange={imageField.onChange}
                            disabled={imagesLoading || imageOptions.length === 0}
                          >
                            <SelectTrigger aria-invalid={fieldState.invalid} className="min-w-0 flex-1">
                              <SelectValue
                                placeholder={
                                  imagesLoading
                                    ? '正在加载…'
                                    : imageOptions.length === 0
                                      ? '当前无本地镜像'
                                      : '选择镜像'
                                }
                              />
                            </SelectTrigger>
                            <SelectContent align="start">
                              {imageOptions.map((ref) => (
                                <SelectItem key={ref} value={ref}>
                                  {ref}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </FormFieldRow>
                  )}
                />
              )}
            />
            <FormSection>
              <Controller
                control={control}
                name="forcePull"
                render={({ field }) => (
                  <>
                    <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                      启动前强制拉取
                    </CheckRow>
                    <SectionHint>勾选后每次启动前都会执行 pull 本机已有同名标签时也可用于更新镜像</SectionHint>
                  </>
                )}
              />
            </FormSection>

            {/* 端口 */}
            <FormSection
              title="端口"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 px-2"
                  onClick={() => appendPort(emptyPort())}
                >
                  <Plus className="size-3" />
                  添加映射
                </Button>
              }
              hint="可与下方映射同时使用。启用 `-P` 后，镜像中已 `EXPOSE` 的端口会在主机侧自动分配随机端口。"
            >
              <Controller
                control={control}
                name="publishAllPorts"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value ? 'all' : 'mapped'}
                    onValueChange={(v) => field.onChange(v === 'all')}
                    className="flex flex-col gap-2"
                    aria-label="端口映射方式"
                  >
                    <label className={RADIO_ROW}>
                      <RadioGroupItem value="mapped" id="run-port-mode-mapped" />
                      <span>自定义主机与容器端口</span>
                    </label>
                    <label className={RADIO_ROW}>
                      <RadioGroupItem value="all" id="run-port-mode-all" />
                      <span>映射镜像中 EXPOSE 的全部端口（-P）</span>
                    </label>
                  </RadioGroup>
                )}
              />
              {portFields.length === 0 ? (
                <SectionHint>未添加映射且未启用 -P 时容器内端口不会暴露到主机</SectionHint>
              ) : (
                <div className="space-y-2">
                  {portFields.map((row, i) => (
                    <div key={row.id} className="flex flex-row items-center gap-2 rounded-lg border border-border p-1">
                      <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                        <Controller
                          control={control}
                          name={`ports.${i}.hostPort`}
                          render={({ field, fieldState }) => (
                            <Input
                              type="number"
                              min={0}
                              max={65535}
                              placeholder="主机端口（留空随机分配）"
                              value={field.value == null || field.value === 0 ? '' : field.value}
                              onChange={(e) => {
                                const t = e.target.value
                                if (t === '') {
                                  field.onChange(null)
                                  return
                                }
                                const n = parseInt(t, 10)
                                field.onChange(Number.isFinite(n) ? n : null)
                              }}
                              aria-invalid={fieldState.invalid}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name={`ports.${i}.containerPort`}
                          render={({ field, fieldState }) => (
                            <Input
                              type="number"
                              min={1}
                              max={65535}
                              placeholder="容器端口（必填）"
                              value={field.value || ''}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10)
                                field.onChange(Number.isFinite(v) ? v : 0)
                              }}
                              aria-invalid={fieldState.invalid}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name={`ports.${i}.protocol`}
                          render={({ field, fieldState }) => (
                            <Select value={field.value || 'tcp'} onValueChange={field.onChange}>
                              <SelectTrigger
                                aria-label="协议"
                                aria-invalid={fieldState.invalid}
                                className="w-full min-w-0"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent align="start">
                                <SelectItem value="tcp">tcp</SelectItem>
                                <SelectItem value="udp">udp</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground hover:text-red-500"
                        onClick={() => removePort(i)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            {/* 网络 */}
            <FormSection
              title="网络"
              hint={
                isCustomNetwork
                  ? '当前为自定义网络，可按需指定固定 IPv4 / IPv6。请确保 IP 位于该网络可分配网段内。'
                  : '固定 IP 仅适用于用户自定义网络。若要指定 IPv4 / IPv6，请先切换到自建网络。'
              }
            >
              <Controller
                control={control}
                name="network"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-2">
                    <Select
                      value={field.value.trim() || 'bridge'}
                      onValueChange={field.onChange}
                      disabled={networksLoading}
                    >
                      <SelectTrigger aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder={networksLoading ? '正在加载网络…' : '选择网络'} />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="bridge">bridge</SelectItem>
                        <SelectItem value="host">host</SelectItem>
                        <SelectItem value="none">none</SelectItem>
                        {networks
                          .filter((n) => !BUILT_IN_NETWORKS.has(n.name.toLowerCase()))
                          .map((n) => (
                            <SelectItem key={n.id} value={n.name}>
                              {n.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  control={control}
                  name="ipv4Address"
                  render={({ field, fieldState }) => (
                    <StackField label="IPv4" htmlFor="run-ctr-ipv4" invalid={fieldState.invalid}>
                      <Input
                        id="run-ctr-ipv4"
                        {...field}
                        placeholder="留空则自动分配"
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
                <Controller
                  control={control}
                  name="ipv6Address"
                  render={({ field, fieldState }) => (
                    <StackField label="IPv6" htmlFor="run-ctr-ipv6" invalid={fieldState.invalid}>
                      <Input
                        id="run-ctr-ipv6"
                        {...field}
                        placeholder="留空则自动分配"
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
              </div>
            </FormSection>

            {/* 数据卷 */}
            <FormSection
              title="数据卷"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 px-2"
                  onClick={() => appendVolume(emptyVolume())}
                >
                  <Plus className="size-3" />
                  添加挂载
                </Button>
              }
              hint="当前仅支持主机路径绑定挂载。适合持久化配置、数据目录和日志目录。"
            >
              {volumeFields.map((row, i) => (
                <div key={row.id} className="flex flex-row items-center gap-2 rounded-lg border border-border p-1">
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                    <Controller
                      control={control}
                      name={`volumes.${i}.hostPath`}
                      render={({ field, fieldState }) => (
                        <Input placeholder="主机目录 /data/app" {...field} aria-invalid={fieldState.invalid} />
                      )}
                    />
                    <Controller
                      control={control}
                      name={`volumes.${i}.containerPath`}
                      render={({ field, fieldState }) => (
                        <Input placeholder="容器内路径 var/www" {...field} aria-invalid={fieldState.invalid} />
                      )}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Controller
                      control={control}
                      name={`volumes.${i}.readOnly`}
                      render={({ field }) => (
                        <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                          只读
                        </CheckRow>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-red-500"
                      onClick={() => removeVolume(i)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </FormSection>

            {/* 启动命令 & 入口 */}
            <ArgListEditor
              title="启动命令（CMD）"
              mode={commandMode}
              onModeChange={(mode) => setValue('commandMode', mode)}
              rawValue={commandText}
              onRawChange={(value) => setValue('commandText', value)}
              rawPlaceholder="例如：nginx -g 'daemon off;'"
              hint="留空则沿用镜像默认 CMD。原始命令适合一次性粘贴，参数列表适合逐项编辑。"
              fields={commandArgFields}
              onAddArg={() => appendCommandArg(emptyArgRow())}
              onRemoveArg={removeCommandArg}
              renderArgInput={(index) => (
                <Controller
                  control={control}
                  name={`commandArgs.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Input
                      {...field}
                      placeholder={index === 0 ? '例如 nginx' : '例如 -g / daemon off;'}
                      aria-invalid={fieldState.invalid}
                    />
                  )}
                />
              )}
            />

            <ArgListEditor
              title="入口命令（ENTRYPOINT）"
              mode={entrypointMode}
              onModeChange={(mode) => setValue('entrypointMode', mode)}
              rawValue={entrypointText}
              onRawChange={(value) => setValue('entrypointText', value)}
              rawPlaceholder="例如：/docker-entrypoint.sh nginx"
              hint="留空则沿用镜像默认 ENTRYPOINT。多数镜像无需额外修改，只有需要覆盖入口脚本时再填写。"
              fields={entrypointArgFields}
              onAddArg={() => appendEntrypointArg(emptyArgRow())}
              onRemoveArg={removeEntrypointArg}
              renderArgInput={(index) => (
                <Controller
                  control={control}
                  name={`entrypointArgs.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Input
                      {...field}
                      placeholder={index === 0 ? '例如 /docker-entrypoint.sh' : '例如 nginx'}
                      aria-invalid={fieldState.invalid}
                    />
                  )}
                />
              )}
            />

            {/* 标签 & 环境变量 */}
            <KeyValueEditor
              title="容器标签（Labels）"
              hint="适合写元数据，例如 `app=shipyardx`、`env=prod`。"
              fields={labelFields}
              invalid={Boolean(errors.labelEntries)}
              onAdd={() => appendLabel(emptyKeyValueRow())}
              onRemove={removeLabel}
              renderKeyInput={(index) => (
                <Controller
                  control={control}
                  name={`labelEntries.${index}.key`}
                  render={({ field, fieldState }) => (
                    <Input {...field} placeholder="app" aria-invalid={fieldState.invalid} />
                  )}
                />
              )}
              renderValueInput={(index) => (
                <Controller
                  control={control}
                  name={`labelEntries.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Input {...field} placeholder="shipyardx" aria-invalid={fieldState.invalid} />
                  )}
                />
              )}
            />

            <KeyValueEditor
              title="环境变量"
              hint="前端会校验键名是否为空，提交时会转换为 `KEY=value` 传给 Docker。"
              fields={envFields}
              invalid={Boolean(errors.envEntries)}
              onAdd={() => appendEnv(emptyKeyValueRow())}
              onRemove={removeEnv}
              renderKeyInput={(index) => (
                <Controller
                  control={control}
                  name={`envEntries.${index}.key`}
                  render={({ field, fieldState }) => (
                    <Input {...field} placeholder="TZ" aria-invalid={fieldState.invalid} />
                  )}
                />
              )}
              renderValueInput={(index) => (
                <Controller
                  control={control}
                  name={`envEntries.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Input {...field} placeholder="Asia/Shanghai" aria-invalid={fieldState.invalid} />
                  )}
                />
              )}
            />

            {/* 资源限制 */}
            <FormSection
              title="资源限制"
              hint="CPU 权重用于相对调度优先级，CPU 上限与内存上限用于硬限制。桌面环境下建议先从温和限制开始。"
            >
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setValue('cpuQuotaCores', '0.5')}>
                  0.5 核
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setValue('cpuQuotaCores', '1')}>
                  1 核
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setValue('memoryMb', '512')}>
                  512 MB
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setValue('memoryMb', '1024')}>
                  1 GB
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Controller
                  control={control}
                  name="cpuShares"
                  render={({ field, fieldState }) => (
                    <StackField label="CPU 权重（shares）" htmlFor="run-cpu-shares" invalid={fieldState.invalid}>
                      <Input
                        id="run-cpu-shares"
                        type="number"
                        min={0}
                        {...field}
                        placeholder="默认 1024；0 表示不设置"
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
                <Controller
                  control={control}
                  name="cpuQuotaCores"
                  render={({ field, fieldState }) => (
                    <StackField label="CPU 上限（核数）" htmlFor="run-cpu-quota" invalid={fieldState.invalid}>
                      <Input
                        id="run-cpu-quota"
                        type="number"
                        min={0}
                        step="0.1"
                        {...field}
                        placeholder="0 或留空表示不限制"
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
                <Controller
                  control={control}
                  name="memoryMb"
                  render={({ field, fieldState }) => (
                    <StackField label="内存上限（MB）" htmlFor="run-mem" invalid={fieldState.invalid}>
                      <Input
                        id="run-mem"
                        type="number"
                        min={0}
                        {...field}
                        placeholder="0 或留空表示不限制"
                        aria-invalid={fieldState.invalid}
                      />
                    </StackField>
                  )}
                />
              </div>
            </FormSection>

            {/* 其它选项 */}
            <FormSection title="其它选项">
              <Controller
                control={control}
                name="autoRemove"
                render={({ field }) => (
                  <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                    停止后自动删除容器（--rm）
                  </CheckRow>
                )}
              />
              <SectionHint className="pl-6">
                适合一次性任务或临时调试。启用后容器停止即删除，日志和元数据也会一起消失。
              </SectionHint>
              <Controller
                control={control}
                name="privileged"
                render={({ field }) => (
                  <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                    特权模式，近似主机权限（--privileged）
                  </CheckRow>
                )}
              />
              <SectionHint className="pl-6">特权模式会显著扩大容器可访问的主机能力（谨慎启用！）</SectionHint>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <Controller
                  control={control}
                  name="tty"
                  render={({ field }) => (
                    <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                      分配伪终端（-t）
                    </CheckRow>
                  )}
                />
                <Controller
                  control={control}
                  name="openStdin"
                  render={({ field }) => (
                    <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                      保持标准输入打开（-i）
                    </CheckRow>
                  )}
                />
              </div>
              <SectionHint className="pl-6">
                交互式容器通常会同时开启 TTY 和保持标准输入打开；如果只是后台服务，一般不需要勾选。
              </SectionHint>
            </FormSection>

            {/* 重启策略 */}
            <FormSection
              title="重启策略"
              hint={
                restartPolicy === 'no'
                  ? '容器退出后不自动重启。适合一次性任务。'
                  : restartPolicy === 'always'
                    ? 'Docker 或宿主重启后都会尝试拉起容器。适合常驻服务。'
                    : restartPolicy === 'unless-stopped'
                      ? '与 always 类似，但手动停止后不会自动恢复。适合日常服务。'
                      : '仅当容器异常退出时重试，适合需要保护但不希望无限重启的任务。'
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  control={control}
                  name="restartPolicy"
                  render={({ field, fieldState }) => (
                    <StackField label="策略" invalid={fieldState.invalid}>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-invalid={fieldState.invalid} className="w-full">
                          <SelectValue>
                            {(value) => getRestartPolicyLabel(value as RunContainerFormValues['restartPolicy'])}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start">
                          {RESTART_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </StackField>
                  )}
                />
                {restartPolicy === 'on-failure' ? (
                  <Controller
                    control={control}
                    name="restartMaxRetry"
                    render={({ field, fieldState }) => (
                      <StackField
                        label="最大重试次数（on-failure）"
                        htmlFor="run-restart-max"
                        invalid={fieldState.invalid}
                      >
                        <Input
                          id="run-restart-max"
                          type="number"
                          min={0}
                          {...field}
                          aria-invalid={fieldState.invalid}
                        />
                      </StackField>
                    )}
                  />
                ) : null}
              </div>
            </FormSection>
          </FieldGroup>
        </form>
      ) : (
        <PullProgress
          steps={progressSteps}
          pullProgress={flow.pullProgress}
          showPullProgress={flow.showPullProgress}
          error={flow.progressError}
        />
      )}
    </StandardDialog>
  )
}
