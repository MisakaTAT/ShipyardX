import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cancelStream, listImages, runContainer } from '@/lib/commands'
import { pullImage } from '@/lib/pullImageStream'
import { cn } from '@/lib/utils'
import type { Image, RunContainer } from '@/types'
import { imageRefExistsOnHost, listSelectableImageRefs } from '@/utils/dockerImageRef'
import {
  buildRunParamsFromForm,
  formatContainerRun,
  parseContainerRun,
  paramsToFormState,
  validateRunParams,
} from '@/utils/dockerRunCli'
import { Box, CheckCircle2, Circle, Loader2, Play, Plus, Trash2, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** 与 NetworkPanel 等创建弹窗内 Input 一致 */
const dialogFieldClass = 'border-(--border-sub) bg-(--bg-input) text-sm text-(--text-base)'

const RESTART_OPTIONS = [
  { value: 'no', label: '不重启' },
  { value: 'always', label: '总是重启' },
  { value: 'unless-stopped', label: '除非手动停止' },
  { value: 'on-failure', label: '失败时重启' },
] as const

type Phase = 'form' | 'progress'

type EditorMode = 'form' | 'raw'

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
  protocol: string
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

function StepRow({ status, title, detail }: { status: StepState; title: string; detail?: string }) {
  const icon =
    status === 'done' ? (
      <CheckCircle2 className="size-5 shrink-0 text-green-500" />
    ) : status === 'error' ? (
      <XCircle className="size-5 shrink-0 text-red-500" />
    ) : status === 'active' ? (
      <Loader2 className="size-5 shrink-0 animate-spin text-(--accent-text)" />
    ) : (
      <Circle className="size-5 shrink-0 text-(--text-muted)" />
    )

  return (
    <div className="flex gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-(--text-strong)">{title}</p>
        {detail ? <p className="mt-0.5 text-xs text-(--text-muted)">{detail}</p> : null}
      </div>
    </div>
  )
}

export default function RunContainerDialog({ open, onOpenChange, serverId, onSuccess }: RunContainerDialogProps) {
  const datalistId = useId()
  const mountedRef = useRef(true)
  const pendingParamsRef = useRef<RunContainer | null>(null)
  const pullStreamIdRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [editorMode, setEditorMode] = useState<EditorMode>('form')
  const [rawText, setRawText] = useState('')
  const [images, setImages] = useState<Image[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)

  const [image, setImage] = useState('')
  const [name, setName] = useState('')
  const [envText, setEnvText] = useState('')
  const [ports, setPorts] = useState<PortFormRow[]>([])
  const [volumes, setVolumes] = useState<VolumeFormRow[]>([])
  const [restartPolicy, setRestartPolicy] = useState<string>('unless-stopped')
  const [restartMaxRetry, setRestartMaxRetry] = useState('0')

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
    setEditorMode('form')
    setRawText('')
    setImage('')
    setName('')
    setEnvText('')
    setPorts([])
    setVolumes([])
    setRestartPolicy('unless-stopped')
    setRestartMaxRetry('0')
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
    void listImages({ serverId })
      .then((data) => {
        if (mountedRef.current) setImages(data)
      })
      .catch(() => {
        if (mountedRef.current) setImages([])
      })
      .finally(() => {
        if (mountedRef.current) setImagesLoading(false)
      })
  }, [open, serverId])

  useEffect(() => {
    if (phase !== 'progress' || !showPullLog) return
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pullLines, phase, showPullLog])

  const imageOptions = listSelectableImageRefs(images)

  const handleBackFromProgress = useCallback(async () => {
    if (pullStreamIdRef.current) {
      try {
        await cancelStream({ streamId: pullStreamIdRef.current })
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
    const needsPull = !imageRefExistsOnHost(img, images)

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
        setImageStepDetail('拉取完成')
      } else {
        setImageStepTitle('检查镜像')
        setImageStepDetail('本地已存在该镜像')
        setImageStep('done')
      }

      if (!mountedRef.current) return
      setRunStep('active')
      const containerId = await runContainer({ serverId, params })
      if (!mountedRef.current) return
      setRunStep('done')

      const short = containerId.replace(/^sha256:/, '').slice(0, 12)
      toast.success(`容器已启动（${short}）`)
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

  const syncRawFromForm = useCallback(() => {
    const envLines = envText.split('\n')
    const hasDraft =
      image.trim() || name.trim() || envLines.some((l) => l.trim()) || ports.length > 0 || volumes.length > 0
    if (!hasDraft) {
      setRawText('')
      return
    }
    const params = buildRunParamsFromForm({
      image,
      name,
      envLines,
      ports,
      volumes,
      restartPolicy,
      restartMaxRetry,
    })
    setRawText(formatContainerRun(params))
  }, [image, name, envText, ports, volumes, restartPolicy, restartMaxRetry])

  /**
   * 将当前 rawText 解析并写入表单（与点「运行」不同：允许缺镜像等草稿状态）。
   * 空白文本则直接切回表单、不改表单内容。
   */
  const syncFormFromRaw = useCallback((): boolean => {
    if (!rawText.trim()) return true
    const parsed = parseContainerRun(rawText)
    if (!parsed.ok) {
      toast.error(parsed.error)
      return false
    }
    const s = paramsToFormState(parsed.params)
    setImage(s.image)
    setName(s.name)
    setEnvText(s.envText)
    setPorts(s.ports.length ? s.ports : [])
    setVolumes(s.volumes.length ? s.volumes : [])
    setRestartPolicy(s.restartPolicy)
    setRestartMaxRetry(s.restartMaxRetry)
    return true
  }, [rawText])

  const handleSubmit = () => {
    let params: RunContainer

    if (editorMode === 'raw') {
      const parsed = parseContainerRun(rawText)
      if (!parsed.ok) {
        toast.error(parsed.error)
        return
      }
      params = parsed.params
    } else {
      if (!image.trim()) {
        toast.warning('请填写或选择镜像')
        return
      }
      params = buildRunParamsFromForm({
        image,
        name,
        envLines: envText.split('\n'),
        ports,
        volumes,
        restartPolicy,
        restartMaxRetry,
      })
    }

    const err = validateRunParams(params)
    if (err) {
      toast.warning(err)
      return
    }

    pendingParamsRef.current = params
    setPhase('progress')
    void executeRun()
  }

  const stepActive = imageStep === 'active' || runStep === 'active'

  const formContentClass = cn(
    'flex max-h-[min(92vh,820px)] flex-col gap-0 overflow-hidden p-0',
    editorMode === 'raw' ? 'max-w-[min(96vw,42rem)] sm:max-w-[42rem]' : 'max-w-lg sm:max-w-lg',
  )
  const progressContentClass =
    'fixed inset-0 z-50 flex h-[100dvh] w-screen max-h-none max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none'

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
        showCloseButton={false}
        className={cn(
          'bg-(--bg-overlay) text-sm text-(--text-base) shadow-2xl',
          phase === 'form' ? formContentClass : progressContentClass,
        )}
        onPointerDownOutside={phase === 'progress' && stepActive ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={phase === 'progress' && stepActive ? (e) => e.preventDefault() : undefined}
      >
        {phase === 'form' ? (
          <>
            <DialogHeader className="flex shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
              <Box className="size-4 text-(--accent-text)" />
              <DialogTitle className="flex-1 text-sm font-semibold text-(--text-strong)">运行新容器</DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)"
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" />
              </Button>
            </DialogHeader>

            <div className="flex shrink-0 gap-1 border-b border-border px-3 py-2">
              <Button
                type="button"
                variant={editorMode === 'form' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 rounded-lg text-xs"
                onClick={() => {
                  if (editorMode === 'form') return
                  if (syncFormFromRaw()) setEditorMode('form')
                }}
              >
                表单
              </Button>
              <Button
                type="button"
                variant={editorMode === 'raw' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 rounded-lg text-xs"
                onClick={() => {
                  syncRawFromForm()
                  setEditorMode('raw')
                }}
              >
                原始命令
              </Button>
            </div>

            {editorMode === 'form' ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-(--text-muted)">镜像 *</label>
                  <Input
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    list={datalistId}
                    placeholder={imagesLoading ? '加载镜像列表…' : '从列表选择或输入镜像名，如 nginx:alpine'}
                    disabled={imagesLoading}
                    autoComplete="off"
                    className={cn('font-mono', dialogFieldClass)}
                  />
                  <datalist id={datalistId}>
                    {imageOptions.map((ref) => (
                      <option key={ref} value={ref} />
                    ))}
                  </datalist>
                  <p className="text-xs text-(--text-muted)">
                    支持从本机已有镜像中选择，或手动输入；若远程不存在该镜像，运行时将自动拉取后再创建容器。
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-(--text-muted)">容器名称（可选）</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="仅字母、数字、_、-、."
                    className={dialogFieldClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-(--text-muted)">环境变量（每行 KEY=value）</label>
                  <textarea
                    value={envText}
                    onChange={(e) => setEnvText(e.target.value)}
                    placeholder={'TZ=Asia/Shanghai\nFOO=bar'}
                    rows={4}
                    className={cn(
                      'min-h-[96px] w-full resize-y rounded-lg border border-(--border-sub) bg-(--bg-input) px-3 py-2 font-mono text-sm text-(--text-base)',
                      'placeholder:text-(--text-muted) transition-colors outline-none focus-visible:border-(--accent) focus-visible:ring-0',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-(--text-muted)">端口映射</label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setPorts((prev) => [...prev, emptyPort()])}
                    >
                      <Plus className="size-3" />
                      添加
                    </Button>
                  </div>
                  {ports.length === 0 ? (
                    <p className="text-xs text-(--text-muted)">不添加则容器不发布端口（与镜像 EXPOSE 无关）。</p>
                  ) : (
                    <div className="space-y-2">
                      {ports.map((p, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-(--bg-surface) p-2"
                        >
                          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="space-y-1">
                              <span className="text-[10px] text-(--text-muted)">主机端口</span>
                              <Input
                                type="number"
                                min={0}
                                max={65535}
                                placeholder="随机"
                                value={p.hostPort == null ? '' : p.hostPort === 0 ? '' : p.hostPort}
                                onChange={(e) => {
                                  const t = e.target.value
                                  setPorts((prev) => {
                                    const next = [...prev]
                                    const cur = { ...next[i] }
                                    if (t === '') cur.hostPort = null
                                    else cur.hostPort = parseInt(t, 10)
                                    next[i] = cur
                                    return next
                                  })
                                }}
                                className={cn('h-8 font-mono text-xs', dialogFieldClass)}
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-(--text-muted)">容器端口 *</span>
                              <Input
                                type="number"
                                min={1}
                                max={65535}
                                value={p.containerPort || ''}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10)
                                  setPorts((prev) => {
                                    const next = [...prev]
                                    next[i] = { ...next[i], containerPort: Number.isFinite(v) ? v : 0 }
                                    return next
                                  })
                                }}
                                className={cn('h-8 font-mono text-xs', dialogFieldClass)}
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <span className="text-[10px] text-(--text-muted)">协议</span>
                              <Select
                                value={p.protocol || 'tcp'}
                                onValueChange={(v) =>
                                  setPorts((prev) => {
                                    const next = [...prev]
                                    next[i] = { ...next[i], protocol: v }
                                    return next
                                  })
                                }
                              >
                                <SelectTrigger className={cn('h-8', dialogFieldClass)} size="sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="popper" align="start">
                                  <SelectItem value="tcp">tcp</SelectItem>
                                  <SelectItem value="udp">udp</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 text-(--text-muted) hover:text-red-500"
                            onClick={() => setPorts((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-(--text-muted)">卷挂载（主机:容器）</label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setVolumes((prev) => [...prev, emptyVolume()])}
                    >
                      <Plus className="size-3" />
                      添加
                    </Button>
                  </div>
                  {volumes.map((v, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-(--bg-surface) p-2 sm:flex-row sm:items-end"
                    >
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="主机路径，如 /data/app"
                          value={v.hostPath}
                          onChange={(e) =>
                            setVolumes((prev) => {
                              const next = [...prev]
                              next[i] = { ...next[i], hostPath: e.target.value }
                              return next
                            })
                          }
                          className={cn('font-mono text-xs', dialogFieldClass)}
                        />
                        <Input
                          placeholder="容器内路径，如 /var/www"
                          value={v.containerPath}
                          onChange={(e) =>
                            setVolumes((prev) => {
                              const next = [...prev]
                              next[i] = { ...next[i], containerPath: e.target.value }
                              return next
                            })
                          }
                          className={cn('font-mono text-xs', dialogFieldClass)}
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <label className="flex cursor-pointer items-start gap-2.5 text-left text-xs text-(--text-base)">
                          <input
                            type="checkbox"
                            checked={v.readOnly}
                            onChange={(e) =>
                              setVolumes((prev) => {
                                const next = [...prev]
                                next[i] = { ...next[i], readOnly: e.target.checked }
                                return next
                              })
                            }
                            className="mt-0.5 size-3.5 shrink-0 rounded border-(--border-sub) bg-(--bg-input) accent-(--accent)"
                          />
                          <span>只读</span>
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-(--text-muted) hover:text-red-500"
                          onClick={() => setVolumes((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-(--text-muted)">重启策略</label>
                    <Select value={restartPolicy} onValueChange={setRestartPolicy}>
                      <SelectTrigger className={cn('w-full', dialogFieldClass)} size="default">
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
                  </div>
                  {restartPolicy === 'on-failure' ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-(--text-muted)">最大重试次数</label>
                      <Input
                        type="number"
                        min={0}
                        value={restartMaxRetry}
                        onChange={(e) => setRestartMaxRetry(e.target.value)}
                        className={cn('font-mono', dialogFieldClass)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
                <p className="text-xs leading-relaxed text-(--text-muted)">
                  粘贴或编辑完整的 <span className="font-mono text-(--text-soft)">docker run</span> 命令（可含行尾{' '}
                  <span className="font-mono">\</span>{' '}
                  续行）。切到「表单」会自动解析并同步到表单；切回「原始命令」会用当前表单重新生成命令。 支持常见参数：
                  <span className="font-mono"> --name</span>、<span className="font-mono"> --restart</span>、
                  <span className="font-mono"> -p</span>、<span className="font-mono"> -v</span>、
                  <span className="font-mono"> -e</span>。
                  <span className="text-(--text-strong)"> 镜像名须写在最后一行</span>；镜像后的命令参数会被忽略。
                </p>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  spellCheck={false}
                  placeholder={'docker run -d \\\n  --name myapp \\\n  -p 8080:80 \\\n  nginx:alpine'}
                  className={cn(
                    'min-h-[260px] w-full flex-1 resize-y rounded-lg border border-(--border-sub) bg-(--bg-input) px-3 py-2 font-mono text-xs leading-relaxed text-(--text-base)',
                    'placeholder:text-(--text-muted) transition-colors outline-none focus-visible:border-(--accent) focus-visible:ring-0',
                  )}
                />
              </div>
            )}

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={editorMode === 'form' ? !image.trim() || imagesLoading : !rawText.trim()}
                onClick={handleSubmit}
              >
                <Play className="size-3.5 stroke-[2.5]" />
                运行
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="flex shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3">
              <Loader2
                className={cn('size-4 shrink-0 text-(--accent-text)', stepActive ? 'animate-spin' : 'opacity-60')}
              />
              <DialogTitle className="flex-1 text-sm font-semibold text-(--text-strong)">正在运行容器</DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-(--text-muted)"
                disabled={runStep === 'active'}
                onClick={() => void handleBackFromProgress()}
              >
                {imageStep === 'active' ? '取消拉取' : '返回修改'}
              </Button>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
              <div className="space-y-4 rounded-xl border border-border bg-(--bg-panel) p-4">
                <StepRow status={imageStep} title={imageStepTitle || '镜像'} detail={imageStepDetail} />
                <StepRow
                  status={runStep}
                  title="创建并启动容器"
                  detail={runStep === 'active' ? '正在请求 Docker…' : undefined}
                />
              </div>

              {showPullLog ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-(--bg-surface)">
                  <div className="shrink-0 border-b border-border px-3 py-2 text-xs font-medium text-(--text-muted)">
                    拉取输出
                  </div>
                  <div
                    className="min-h-[200px] flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-(--text-soft)"
                    style={{ background: 'var(--bg-app)' }}
                  >
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
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
