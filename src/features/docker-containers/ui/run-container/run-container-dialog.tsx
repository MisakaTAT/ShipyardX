import { useCallback, useEffect, useId, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Box, Play, Plus, Trash2, X } from 'lucide-react'
import { commands, type Image, type Network } from '@/types/app-bindings'
import {
  runContainerFormDefaultValues,
  runContainerFormSchema,
  runFormValuesToBuildArgs,
  type RunContainerFormValues,
} from '@/features/docker-containers/model/run-container-schema'
import { buildRunParamsFromForm } from '@/features/docker-containers/lib/docker-run-cli'
import { listSelectableImageRefs } from '@/shared/lib/docker-image-ref'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { modalDialogContent } from '@/shared/styles/variants'
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

function emptyPort(): RunContainerFormValues['ports'][number] {
  return { containerPort: 80, hostPort: null, protocol: 'tcp' }
}

function emptyVolume(): RunContainerFormValues['volumes'][number] {
  return { hostPath: '', containerPath: '', readOnly: false }
}

function SectionTitle({ className, invalid, ...props }: ComponentProps<typeof FieldTitle> & { invalid?: boolean }) {
  return <FieldTitle className={cn(SECTION_TITLE, invalid ? 'text-destructive' : null, className)} {...props} />
}

function SectionHint({ className, ...props }: ComponentProps<typeof FieldDescription>) {
  return <FieldDescription className={cn(SECTION_HINT, className)} {...props} />
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
    reset: resetForm,
  } = form

  const { fields: portFields, append: appendPort, remove: removePort } = useFieldArray({ control, name: 'ports' })
  const {
    fields: volumeFields,
    append: appendVolume,
    remove: removeVolume,
  } = useFieldArray({ control, name: 'volumes' })

  const restartPolicy = watch('restartPolicy')
  const imageInvalid = !!errors.image

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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (flow.phase === 'progress' && flow.isStepActive) return
          onOpenChange(false)
        }
      }}
    >
      <DialogContent className={cn(modalDialogContent, 'max-h-180 w-170 max-w-none!')} showCloseButton={false}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3">
          <span className="flex shrink-0 text-primary [&_svg]:size-4">
            <Box />
          </span>
          <DialogTitle className="flex-1 text-[15px] leading-none font-semibold text-foreground">运行容器</DialogTitle>
          {flow.phase === 'form' ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              disabled={flow.runStep === 'active'}
              onClick={() => void flow.handleBackFromProgress()}
            >
              {flow.imageStep === 'active' ? '中断拉取' : '返回编辑'}
            </Button>
          )}
        </div>

        {flow.phase === 'form' ? (
          <>
            <form
              id="run-container-builder-form"
              className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4"
              onSubmit={submitWithToast}
              noValidate
            >
              <FieldGroup className="gap-7">
                {/* 基础：名称 + 镜像 */}
                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="run-ctr-name">容器名称</FieldLabel>
                      <FieldContent>
                        <Input
                          id="run-ctr-name"
                          {...field}
                          placeholder="留空由 Docker 命名"
                          aria-invalid={fieldState.invalid}
                        />
                        <SectionHint>仅支持字母数字下划线连字符与英文句点</SectionHint>
                      </FieldContent>
                    </Field>
                  )}
                />

                <div className={SECTION_SHELL}>
                  <SectionTitle invalid={imageInvalid}>镜像</SectionTitle>
                  <Controller
                    control={control}
                    name="imageManualInput"
                    render={({ field: manualField }) => (
                      <>
                        <Controller
                          control={control}
                          name="image"
                          render={({ field: imageField, fieldState }) => (
                            <Field data-invalid={fieldState.invalid} className="gap-2">
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
                                  <SelectTrigger className="w-32 shrink-0">
                                    <SelectValue>
                                      {(v) => (v === 'manual' ? '自定' : v === 'list' ? '列表' : v)}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent align="start">
                                    <SelectItem value="manual">自定</SelectItem>
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
                                      imageField.value && imageOptions.includes(imageField.value)
                                        ? imageField.value
                                        : undefined
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
                              {manualField.value ? (
                                <SectionHint>
                                  可联想本地列表或直接输入完整引用 本机无该标签时启动前会自动拉取
                                </SectionHint>
                              ) : !imagesLoading && imageOptions.length === 0 ? (
                                <SectionHint>当前无本地镜像 可切换到自定输入 或先到镜像页拉取后再选</SectionHint>
                              ) : null}
                            </Field>
                          )}
                        />
                      </>
                    )}
                  />
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
                </div>

                {/* 端口 */}
                <div className={SECTION_SHELL}>
                  <div className="flex items-center justify-between">
                    <SectionTitle>端口</SectionTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 px-2"
                      onClick={() => appendPort(emptyPort())}
                    >
                      <Plus className="size-3" />
                      添加映射
                    </Button>
                  </div>
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
                  <SectionHint>
                    可与下方映射同时使用 启用 -P 时为 Dockerfile 中 EXPOSE 端口在主机分配临时端口
                  </SectionHint>
                  {portFields.length === 0 ? (
                    <SectionHint>未添加映射且未启用 -P 时容器内端口不会暴露到主机</SectionHint>
                  ) : (
                    <div className="space-y-2">
                      {portFields.map((row, i) => (
                        <div
                          key={row.id}
                          className="flex flex-row items-center gap-2 rounded-lg border border-border p-1"
                        >
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
                </div>

                {/* 网络 */}
                <div className={SECTION_SHELL}>
                  <Controller
                    control={control}
                    name="network"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="gap-2">
                        <SectionTitle>网络</SectionTitle>
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
                  <SectionHint>固定 IP 仅适用于用户自定义网络 填写 IP 后请在网络下拉选择对应名称</SectionHint>
                  <div className="grid grid-cols-2 gap-3">
                    <Controller
                      control={control}
                      name="ipv4Address"
                      render={({ field, fieldState }) => (
                        <div className={FIELD_SHELL}>
                          <FieldLabel htmlFor="run-ctr-ipv4">IPv4</FieldLabel>
                          <Input
                            id="run-ctr-ipv4"
                            {...field}
                            placeholder="留空则自动分配"
                            aria-invalid={fieldState.invalid}
                          />
                        </div>
                      )}
                    />
                    <Controller
                      control={control}
                      name="ipv6Address"
                      render={({ field, fieldState }) => (
                        <div className={FIELD_SHELL}>
                          <FieldLabel htmlFor="run-ctr-ipv6">IPv6</FieldLabel>
                          <Input
                            id="run-ctr-ipv6"
                            {...field}
                            placeholder="留空则自动分配"
                            aria-invalid={fieldState.invalid}
                          />
                        </div>
                      )}
                    />
                  </div>
                </div>

                {/* 数据卷 */}
                <div className={SECTION_SHELL}>
                  <div className="flex items-center justify-between">
                    <SectionTitle>数据卷</SectionTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 px-2"
                      onClick={() => appendVolume(emptyVolume())}
                    >
                      <Plus className="size-3" />
                      添加挂载
                    </Button>
                  </div>
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
                </div>

                {/* 启动命令 & 入口 */}
                <Controller
                  control={control}
                  name="commandText"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="run-ctr-cmd">启动命令（CMD）</FieldLabel>
                      <FieldContent>
                        <Textarea
                          id="run-ctr-cmd"
                          {...field}
                          placeholder={'nginx\n-g\ndaemon off;'}
                          rows={3}
                          aria-invalid={fieldState.invalid}
                        />
                        <SectionHint>留空则沿用镜像默认 CMD</SectionHint>
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="entrypointLine"
                  render={({ field }) => (
                    <div className={FIELD_SHELL}>
                      <FieldLabel htmlFor="run-ctr-ep">入口命令（ENTRYPOINT）</FieldLabel>
                      <Input id="run-ctr-ep" {...field} placeholder="/docker-entrypoint.sh" />
                      <SectionHint>留空则沿用镜像默认 ENTRYPOINT</SectionHint>
                    </div>
                  )}
                />

                {/* 标签 & 环境变量 */}
                <Controller
                  control={control}
                  name="labelText"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="run-ctr-labels">容器标签（Labels）</FieldLabel>
                      <FieldContent>
                        <Textarea
                          id="run-ctr-labels"
                          {...field}
                          placeholder={'app=ShipyardX'}
                          aria-invalid={fieldState.invalid}
                        />
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  control={control}
                  name="envText"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="run-ctr-env">环境变量</FieldLabel>
                      <FieldContent>
                        <Textarea
                          id="run-ctr-env"
                          {...field}
                          placeholder={'TZ=Asia/Shanghai'}
                          aria-invalid={fieldState.invalid}
                        />
                      </FieldContent>
                    </Field>
                  )}
                />

                {/* 资源限制 */}
                <div className="grid grid-cols-3 gap-3">
                  <Controller
                    control={control}
                    name="cpuShares"
                    render={({ field, fieldState }) => (
                      <div className={FIELD_SHELL}>
                        <FieldLabel htmlFor="run-cpu-shares">CPU 权重（shares）</FieldLabel>
                        <Input
                          id="run-cpu-shares"
                          type="number"
                          min={0}
                          {...field}
                          placeholder="默认 1024；0 表示不设置"
                          aria-invalid={fieldState.invalid}
                        />
                      </div>
                    )}
                  />
                  <Controller
                    control={control}
                    name="cpuQuotaCores"
                    render={({ field, fieldState }) => (
                      <div className={FIELD_SHELL}>
                        <FieldLabel htmlFor="run-cpu-quota">CPU 上限（核数）</FieldLabel>
                        <Input
                          id="run-cpu-quota"
                          type="number"
                          min={0}
                          step="0.1"
                          {...field}
                          placeholder="0 或留空表示不限制"
                          aria-invalid={fieldState.invalid}
                        />
                      </div>
                    )}
                  />
                  <Controller
                    control={control}
                    name="memoryMb"
                    render={({ field, fieldState }) => (
                      <div className={FIELD_SHELL}>
                        <FieldLabel htmlFor="run-mem">内存上限（MB）</FieldLabel>
                        <Input
                          id="run-mem"
                          type="number"
                          min={0}
                          {...field}
                          placeholder="0 或留空表示不限制"
                          aria-invalid={fieldState.invalid}
                        />
                      </div>
                    )}
                  />
                </div>

                {/* 其它选项 */}
                <div className={SECTION_SHELL}>
                  <SectionTitle>其它选项</SectionTitle>
                  <Controller
                    control={control}
                    name="autoRemove"
                    render={({ field }) => (
                      <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                        停止后自动删除容器（--rm）
                      </CheckRow>
                    )}
                  />
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
                </div>

                {/* 重启策略 */}
                <div className="grid grid-cols-2 gap-3">
                  <Controller
                    control={control}
                    name="restartPolicy"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="gap-2">
                        <SectionTitle>重启策略</SectionTitle>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-invalid={fieldState.invalid}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="start">
                            {RESTART_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  />
                  {restartPolicy === 'on-failure' ? (
                    <Controller
                      control={control}
                      name="restartMaxRetry"
                      render={({ field, fieldState }) => (
                        <div className={FIELD_SHELL}>
                          <FieldLabel htmlFor="run-restart-max">最大重试次数（on-failure）</FieldLabel>
                          <Input
                            id="run-restart-max"
                            type="number"
                            min={0}
                            {...field}
                            aria-invalid={fieldState.invalid}
                          />
                        </div>
                      )}
                    />
                  ) : null}
                </div>
              </FieldGroup>
            </form>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" form="run-container-builder-form" className="gap-1.5" disabled={imagesLoading}>
                <Play />
                运行
              </Button>
            </div>
          </>
        ) : (
          <PullProgress
            steps={progressSteps}
            pullProgress={flow.pullProgress}
            showPullProgress={flow.showPullProgress}
            error={flow.progressError}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
