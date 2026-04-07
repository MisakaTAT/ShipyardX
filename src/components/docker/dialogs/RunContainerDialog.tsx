import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { commands } from '@/types/app-bindings'
import { pullImage } from '@/lib/pullImageStream'
import {
  runContainerFormDefaultValues,
  runContainerFormSchema,
  runFormValuesToBuildArgs,
  type RunContainerFormValues,
} from '@/schema/runContainerFormSchema'
import type { Image, Network, RunContainer } from '@/types/app-bindings'
import { imageRefExistsOnHost, listSelectableImageRefs } from '@/utils/dockerImageRef'
import { buildRunParamsFromForm } from '@/utils/dockerRunCli'
import { Box, CheckCircle2, Circle, Loader2, Play, Plus, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeaderBar } from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const checkRowClass = 'flex cursor-pointer items-start gap-2.5 text-left text-xs leading-snug text-foreground'

const RESTART_OPTIONS = [
  { value: 'no', label: '不自动重启' },
  { value: 'always', label: '始终重启' },
  { value: 'unless-stopped', label: '除非已手动停止' },
  { value: 'on-failure', label: '非零退出时重启' },
] as const

type Phase = 'form' | 'progress'

type StepState = 'pending' | 'active' | 'done' | 'error'

interface RunContainerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverId: string
  onSuccess: () => void
}

interface PortFormRow {
  containerPort: number
  hostPort: number | null
  protocol: 'tcp' | 'udp'
}

interface VolumeFormRow {
  hostPath: string
  containerPath: string
  readOnly: boolean
}

function emptyPort(): PortFormRow {
  return { containerPort: 80, hostPort: null, protocol: 'tcp' }
}

function emptyVolume(): VolumeFormRow {
  return { hostPath: '', containerPath: '', readOnly: false }
}

export default function RunContainerDialog({ open, onOpenChange, serverId, onSuccess }: RunContainerDialogProps) {
  const datalistId = useId()
  const mountedRef = useRef(true)
  const pendingParamsRef = useRef<RunContainer | null>(null)
  const pendingForcePullRef = useRef(false)
  const pullStreamIdRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [images, setImages] = useState<Image[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)

  const form = useForm<RunContainerFormValues>({
    resolver: zodResolver(runContainerFormSchema),
    defaultValues: runContainerFormDefaultValues,
    mode: 'onSubmit',
  })

  const {
    fields: portFields,
    append: appendPortRow,
    remove: removePortRow,
  } = useFieldArray({
    control: form.control,
    name: 'ports',
  })

  const {
    fields: volumeFields,
    append: appendVolumeRow,
    remove: removeVolumeRow,
  } = useFieldArray({
    control: form.control,
    name: 'volumes',
  })

  const restartPolicy = form.watch('restartPolicy')

  const [networks, setNetworks] = useState<Network[]>([])
  const [networksLoading, setNetworksLoading] = useState(false)

  const [imageStep, setImageStep] = useState<StepState>('pending')
  const [runStep, setRunStep] = useState<StepState>('pending')
  const [imageStepTitle, setImageStepTitle] = useState('')
  const [imageStepDetail, setImageStepDetail] = useState('')
  const [pullLines, setPullLines] = useState<string[]>([])
  const [showPullLog, setShowPullLog] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setPhase('form')
    form.reset(runContainerFormDefaultValues)
    setNetworks([])
    setNetworksLoading(true)
    pendingForcePullRef.current = false
    setImageStep('pending')
    setRunStep('pending')
    setImageStepTitle('')
    setImageStepDetail('')
    setPullLines([])
    setShowPullLog(false)
    setProgressError(null)
    pendingParamsRef.current = null
    pullStreamIdRef.current = null

    setImagesLoading(true)
    void commands
      .listImages(serverId)
      .then((data) => {
        if (mountedRef.current) setImages(data)
      })
      .catch(() => {
        if (mountedRef.current) setImages([])
      })
      .finally(() => {
        if (mountedRef.current) setImagesLoading(false)
      })

    void commands
      .listNetworks(serverId)
      .then((data) => {
        if (mountedRef.current) setNetworks(data)
      })
      .catch(() => {
        if (mountedRef.current) setNetworks([])
      })
      .finally(() => {
        if (mountedRef.current) setNetworksLoading(false)
      })
  }, [open, serverId, form.reset])

  useEffect(() => {
    if (phase !== 'progress' || !showPullLog) return
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pullLines, phase, showPullLog])

  const imageOptions = listSelectableImageRefs(images)

  const handleBackFromProgress = useCallback(async () => {
    if (pullStreamIdRef.current) {
      try {
        await commands.cancelStream(pullStreamIdRef.current)
      } catch {
        /* ignore */
      }
      pullStreamIdRef.current = null
    }
    setPhase('form')
    setImageStep('pending')
    setRunStep('pending')
    setProgressError(null)
    setPullLines([])
    setShowPullLog(false)
  }, [])

  const executeRun = useCallback(async () => {
    const params = pendingParamsRef.current
    if (!params) return

    const img = params.image.trim()
    const needsPull = pendingForcePullRef.current || !imageRefExistsOnHost(img, images)

    pullStreamIdRef.current = null
    setProgressError(null)
    setPullLines([])
    setShowPullLog(needsPull)
    setRunStep('pending')

    try {
      if (needsPull) {
        setImageStepTitle('拉取镜像')
        setImageStepDetail(img)
        setImageStep('active')
        await pullImage(serverId, img, (lines) => setPullLines(lines), {
          onStreamId: (id) => {
            pullStreamIdRef.current = id
          },
        })
        if (!mountedRef.current) return
        setImageStep('done')
        setImageStepDetail('镜像已就绪')
      } else {
        setImageStepTitle('检查本地镜像')
        setImageStepDetail('本地已有该标签，跳过拉取')
        setImageStep('done')
      }

      if (!mountedRef.current) return
      setRunStep('active')
      const containerId = await commands.runContainer(serverId, params)
      if (!mountedRef.current) return
      setRunStep('done')

      const short = containerId.replace(/^sha256:/, '').slice(0, 12)
      toast.success(`容器已创建并启动（${short}）`)
      onOpenChange(false)
      onSuccess()
    } catch (e) {
      if (!mountedRef.current) return
      const msg = String(e)
      setProgressError(msg)
      toast.error(msg)
      setRunStep((prev) => (prev === 'active' ? 'error' : prev))
      setImageStep((prev) => {
        if (prev === 'active') return 'error'
        return prev
      })
    }
  }, [serverId, images, onOpenChange, onSuccess])

  const onBuilderSubmit = useCallback(
    (data: RunContainerFormValues) => {
      pendingParamsRef.current = buildRunParamsFromForm(runFormValuesToBuildArgs(data))
      pendingForcePullRef.current = data.forcePull
      setPhase('progress')
      void executeRun()
    },
    [executeRun]
  )

  const stepActive = imageStep === 'active' || runStep === 'active'

  const progressStepRows: { status: StepState; title: string; detail?: string }[] = [
    { status: imageStep, title: imageStepTitle || '镜像准备', detail: imageStepDetail || undefined },
    {
      status: runStep,
      title: '创建并启动容器',
      detail: runStep === 'active' ? '正在向 Docker 提交创建请求…' : undefined,
    },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (phase === 'progress' && stepActive) return
          void onOpenChange(false)
        }
      }}
    >
      <DialogContent
        variant="runContainer"
        onPointerDownOutside={phase === 'progress' && stepActive ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={phase === 'progress' && stepActive ? (e) => e.preventDefault() : undefined}
      >
        {phase === 'form' ? (
          <DialogHeaderBar icon={<Box />} title="启动新容器" onClose={() => onOpenChange(false)} />
        ) : (
          <DialogHeaderBar
            icon={<Box />}
            title="启动新容器"
            headerTrailing={
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                disabled={runStep === 'active'}
                onClick={() => void handleBackFromProgress()}
              >
                {imageStep === 'active' ? '中断拉取' : '返回编辑'}
              </Button>
            }
          />
        )}

        {phase === 'form' ? (
          <>
            <form
              id="run-container-builder-form"
              className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
              onSubmit={form.handleSubmit(onBuilderSubmit)}
              noValidate
            >
              <FieldGroup className="gap-6">
                {form.formState.errors.root?.message ? (
                  <FieldError
                    className="rounded-lg border border-destructive/30 bg-destructive/10 p-3"
                    errors={[form.formState.errors.root]}
                  />
                ) : null}

                <Controller
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="run-ctr-name">容器名称</FieldLabel>
                      <FieldContent>
                        <Input id="run-ctr-name" {...field} placeholder="留空由 Docker 命名" />
                        <FieldDescription>仅支持字母数字下划线连字符与英文句点</FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <div className="space-y-2">
                  <FieldTitle required>镜像</FieldTitle>
                  <Controller
                    control={form.control}
                    name="imageManualInput"
                    render={({ field: manualField }) => (
                      <>
                        <label className={checkRowClass}>
                          <Checkbox
                            checked={manualField.value}
                            onCheckedChange={(c) => {
                              const on = c === true
                              manualField.onChange(on)
                              if (!on) {
                                const cur = form.getValues('image')
                                if (cur && !imageOptions.includes(cur)) form.setValue('image', '')
                              }
                            }}
                            className="mt-0.5"
                          />
                          <span>自定镜像</span>
                        </label>
                        <Controller
                          control={form.control}
                          name="image"
                          render={({ field: imageField, fieldState }) => (
                            <Field data-invalid={fieldState.invalid} className="gap-2">
                              {manualField.value ? (
                                <>
                                  <Input
                                    {...imageField}
                                    list={datalistId}
                                    placeholder={
                                      imagesLoading
                                        ? '正在加载本地镜像…'
                                        : '例如 nginx:alpine 或 registry.example.com/project:tag'
                                    }
                                    disabled={imagesLoading}
                                    autoComplete="off"
                                    className="font-mono"
                                  />
                                  <datalist id={datalistId}>
                                    {imageOptions.map((ref) => (
                                      <option key={ref} value={ref} />
                                    ))}
                                  </datalist>
                                  <FieldDescription>
                                    可联想本地列表或直接输入完整引用 本机无该标签时启动前会自动拉取
                                  </FieldDescription>
                                </>
                              ) : (
                                <>
                                  <Select
                                    value={
                                      imageField.value && imageOptions.includes(imageField.value)
                                        ? imageField.value
                                        : undefined
                                    }
                                    onValueChange={imageField.onChange}
                                    disabled={imagesLoading || imageOptions.length === 0}
                                  >
                                    <SelectTrigger>
                                      <SelectValue
                                        placeholder={
                                          imagesLoading
                                            ? '正在加载…'
                                            : imageOptions.length === 0
                                              ? '当前无本地镜像'
                                              : '从列表选择镜像'
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent position="popper" align="start">
                                      {imageOptions.map((ref) => (
                                        <SelectItem key={ref} value={ref}>
                                          {ref}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {!imagesLoading && imageOptions.length === 0 ? (
                                    <FieldDescription>
                                      可勾选自定镜像自行输入引用 或先到镜像页拉取后再选
                                    </FieldDescription>
                                  ) : null}
                                </>
                              )}
                              <FieldError errors={[fieldState.error]} />
                            </Field>
                          )}
                        />
                      </>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="forcePull"
                    render={({ field }) => (
                      <>
                        <label className={checkRowClass}>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => field.onChange(c === true)}
                            className="mt-0.5"
                          />
                          <span>启动前强制拉取</span>
                        </label>
                        <FieldDescription>
                          勾选后每次启动前都会执行 pull 本机已有同名标签时也可用于更新镜像
                        </FieldDescription>
                      </>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FieldTitle>端口</FieldTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-1 px-2"
                      onClick={() => appendPortRow(emptyPort())}
                    >
                      <Plus className="size-3" />
                      添加映射
                    </Button>
                  </div>
                  <Controller
                    control={form.control}
                    name="publishAllPorts"
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value ? 'all' : 'mapped'}
                        onValueChange={(v) => field.onChange(v === 'all')}
                        className="flex flex-col gap-2"
                        aria-label="端口映射方式"
                      >
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                          <RadioGroupItem value="mapped" id="run-port-mode-mapped" />
                          <span>自定义主机与容器端口</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                          <RadioGroupItem value="all" id="run-port-mode-all" />
                          <span>映射镜像中 EXPOSE 的全部端口（-P）</span>
                        </label>
                      </RadioGroup>
                    )}
                  />
                  <FieldDescription>
                    可与下方映射同时使用 启用 -P 时为 Dockerfile 中 EXPOSE 端口在主机分配临时端口
                  </FieldDescription>
                  {portFields.length === 0 ? (
                    <FieldDescription>未添加映射且未启用 -P 时容器内端口不会暴露到主机</FieldDescription>
                  ) : (
                    <div className="space-y-2">
                      {portFields.map((row, i) => (
                        <div
                          key={row.id}
                          className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-2 sm:flex-row sm:items-center"
                        >
                          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                            <Controller
                              control={form.control}
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
                                  className="min-w-0 font-mono"
                                />
                              )}
                            />
                            <Controller
                              control={form.control}
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
                                  className="min-w-0 font-mono"
                                />
                              )}
                            />
                            <Controller
                              control={form.control}
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
                                  <SelectContent position="popper" align="start">
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
                            icon
                            className="shrink-0 text-muted-foreground hover:text-red-500"
                            onClick={() => removePortRow(i)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Controller
                    control={form.control}
                    name="network"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="gap-2">
                        <FieldTitle>网络</FieldTitle>
                        <Select
                          value={field.value.trim() || 'bridge'}
                          onValueChange={field.onChange}
                          disabled={networksLoading}
                        >
                          <SelectTrigger aria-invalid={fieldState.invalid}>
                            <SelectValue placeholder={networksLoading ? '正在加载网络…' : '选择网络'} />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start">
                            <SelectItem value="bridge">bridge</SelectItem>
                            <SelectItem value="host">host</SelectItem>
                            <SelectItem value="none">none</SelectItem>
                            {networks
                              .filter((n) => !['bridge', 'host', 'none', 'default'].includes(n.name.toLowerCase()))
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
                  <FieldDescription>固定 IP 仅适用于用户自定义网络 填写 IP 后请在网络下拉选择对应名称</FieldDescription>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Controller
                      control={form.control}
                      name="ipv4Address"
                      render={({ field, fieldState }) => (
                        <div className="space-y-2">
                          <FieldLabel htmlFor="run-ctr-ipv4">IPv4</FieldLabel>
                          <Input
                            id="run-ctr-ipv4"
                            {...field}
                            placeholder="留空则自动分配"
                            aria-invalid={fieldState.invalid}
                            className="font-mono"
                          />
                        </div>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="ipv6Address"
                      render={({ field, fieldState }) => (
                        <div className="space-y-2">
                          <FieldLabel htmlFor="run-ctr-ipv6">IPv6</FieldLabel>
                          <Input
                            id="run-ctr-ipv6"
                            {...field}
                            placeholder="留空则自动分配"
                            aria-invalid={fieldState.invalid}
                            className="font-mono"
                          />
                        </div>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FieldTitle>数据卷</FieldTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-1 px-2"
                      onClick={() => appendVolumeRow(emptyVolume())}
                    >
                      <Plus className="size-3" />
                      添加挂载
                    </Button>
                  </div>
                  {volumeFields.map((row, i) => (
                    <div
                      key={row.id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-2 sm:flex-row sm:items-center"
                    >
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                        <Controller
                          control={form.control}
                          name={`volumes.${i}.hostPath`}
                          render={({ field, fieldState }) => (
                            <Input
                              placeholder="主机目录 /data/app"
                              {...field}
                              aria-invalid={fieldState.invalid}
                              className="font-mono"
                            />
                          )}
                        />
                        <Controller
                          control={form.control}
                          name={`volumes.${i}.containerPath`}
                          render={({ field, fieldState }) => (
                            <Input
                              placeholder="容器内路径 var/www"
                              {...field}
                              aria-invalid={fieldState.invalid}
                              className="font-mono"
                            />
                          )}
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Controller
                          control={form.control}
                          name={`volumes.${i}.readOnly`}
                          render={({ field }) => (
                            <label className="flex cursor-pointer items-start gap-2.5 text-left text-xs text-foreground">
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={(c) => field.onChange(c === true)}
                                className="mt-0.5"
                              />
                              <span>只读</span>
                            </label>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          icon
                          className="text-muted-foreground hover:text-red-500"
                          onClick={() => removeVolumeRow(i)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Controller
                  control={form.control}
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
                          className="min-h-[72px] font-mono"
                        />
                        <FieldDescription>留空则沿用镜像默认 CMD</FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  control={form.control}
                  name="entrypointLine"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <FieldLabel htmlFor="run-ctr-ep">入口命令（ENTRYPOINT）</FieldLabel>
                      <Input id="run-ctr-ep" {...field} placeholder="/docker-entrypoint.sh" className="font-mono" />
                      <FieldDescription>留空则沿用镜像默认 ENTRYPOINT</FieldDescription>
                    </div>
                  )}
                />

                <Controller
                  control={form.control}
                  name="labelText"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="run-ctr-labels">容器标签（Labels）</FieldLabel>
                      <FieldContent>
                        <Textarea
                          id="run-ctr-labels"
                          {...field}
                          placeholder={'app=ShipyardX'}
                          rows={3}
                          className="min-h-[72px] font-mono"
                        />
                        <FieldError errors={[fieldState.error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  control={form.control}
                  name="envText"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="run-ctr-env">环境变量</FieldLabel>
                      <FieldContent>
                        <Textarea
                          id="run-ctr-env"
                          {...field}
                          placeholder={'TZ=Asia/Shanghai'}
                          rows={4}
                          className="min-h-[72px] font-mono disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <FieldError errors={[fieldState.error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <Controller
                    control={form.control}
                    name="cpuShares"
                    render={({ field, fieldState }) => (
                      <div className="space-y-2">
                        <FieldLabel htmlFor="run-cpu-shares">CPU 权重（shares）</FieldLabel>
                        <Input
                          id="run-cpu-shares"
                          type="number"
                          min={0}
                          {...field}
                          placeholder="默认 1024；0 表示不设置"
                          aria-invalid={fieldState.invalid}
                          className="font-mono"
                        />
                      </div>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="cpuQuotaCores"
                    render={({ field, fieldState }) => (
                      <div className="space-y-2">
                        <FieldLabel htmlFor="run-cpu-quota">CPU 上限（核数）</FieldLabel>
                        <Input
                          id="run-cpu-quota"
                          type="number"
                          min={0}
                          step="0.1"
                          {...field}
                          placeholder="0 或留空表示不限制"
                          aria-invalid={fieldState.invalid}
                          className="font-mono"
                        />
                      </div>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="memoryMb"
                    render={({ field, fieldState }) => (
                      <div className="space-y-2">
                        <FieldLabel htmlFor="run-mem">内存上限（MB）</FieldLabel>
                        <Input
                          id="run-mem"
                          type="number"
                          min={0}
                          {...field}
                          placeholder="0 或留空表示不限制"
                          aria-invalid={fieldState.invalid}
                          className="font-mono"
                        />
                      </div>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <FieldTitle>其它选项</FieldTitle>
                  <Controller
                    control={form.control}
                    name="autoRemove"
                    render={({ field }) => (
                      <label className={checkRowClass}>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(c) => field.onChange(c === true)}
                          className="mt-0.5"
                        />
                        <span>停止后自动删除容器（--rm）</span>
                      </label>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="privileged"
                    render={({ field }) => (
                      <label className={checkRowClass}>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(c) => field.onChange(c === true)}
                          className="mt-0.5"
                        />
                        <span>特权模式，近似主机权限（--privileged）</span>
                      </label>
                    )}
                  />
                  <FieldDescription className="pl-6">
                    特权模式会显著扩大容器可访问的主机能力（谨慎启用！）
                  </FieldDescription>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <Controller
                      control={form.control}
                      name="tty"
                      render={({ field }) => (
                        <label className={checkRowClass}>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => field.onChange(c === true)}
                            className="mt-0.5"
                          />
                          <span>分配伪终端（-t）</span>
                        </label>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="openStdin"
                      render={({ field }) => (
                        <label className={checkRowClass}>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => field.onChange(c === true)}
                            className="mt-0.5"
                          />
                          <span>保持标准输入打开（-i）</span>
                        </label>
                      )}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Controller
                    control={form.control}
                    name="restartPolicy"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} className="gap-2">
                        <FieldTitle>重启策略</FieldTitle>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-invalid={fieldState.invalid}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start">
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
                      control={form.control}
                      name="restartMaxRetry"
                      render={({ field, fieldState }) => (
                        <div className="space-y-2">
                          <FieldLabel htmlFor="run-restart-max">最大重试次数（on-failure）</FieldLabel>
                          <Input
                            id="run-restart-max"
                            type="number"
                            min={0}
                            {...field}
                            aria-invalid={fieldState.invalid}
                            className="font-mono"
                          />
                        </div>
                      )}
                    />
                  ) : null}
                </div>
              </FieldGroup>
            </form>

            <DialogFooter variant="actionsEnd">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" form="run-container-builder-form" className="gap-1.5" disabled={imagesLoading}>
                <Play />
                运行
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              {progressStepRows.map((row, i) => (
                <div key={i} className="flex gap-3">
                  {row.status === 'done' ? (
                    <CheckCircle2 className="size-5 shrink-0 text-green-500" />
                  ) : row.status === 'error' ? (
                    <XCircle className="size-5 shrink-0 text-red-500" />
                  ) : row.status === 'active' ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Circle className="size-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{row.title}</p>
                    {row.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p> : null}
                  </div>
                </div>
              ))}
            </div>

            {showPullLog ? (
              <div className="flex max-h-[min(40vh,320px)] min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-muted">
                <div className="min-h-[120px] flex-1 overflow-auto bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {pullLines.join('\n')}
                  <div ref={logEndRef} />
                </div>
              </div>
            ) : null}

            {progressError ? (
              <p className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {progressError}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
