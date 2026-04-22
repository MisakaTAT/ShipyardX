import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { commands, type RunContainer, type Image } from '@/types/app-bindings'
import { pullImage } from '@/features/docker-images/lib/pull-image-stream'
import { imageRefExistsOnHost } from '@/shared/lib/docker-image-ref'
import { qk } from '@/shared/api/query-keys'

export type Phase = 'form' | 'progress'
export type StepState = 'pending' | 'active' | 'done' | 'error'

/**
 * "拉取镜像 -> 创建容器" 的两步流程状态机。
 * 把原 RunContainerDialog 里散落的 imageStep/runStep/pullLines 全部收敛。
 */
export function useRunContainerFlow(serverId: string, onSuccess: () => void) {
  const qc = useQueryClient()
  const mountedRef = useRef(true)
  const pendingParamsRef = useRef<RunContainer | null>(null)
  const pendingForcePullRef = useRef(false)
  const pullStreamIdRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [imageStep, setImageStep] = useState<StepState>('pending')
  const [runStep, setRunStep] = useState<StepState>('pending')
  const [imageStepTitle, setImageStepTitle] = useState('')
  const [imageStepDetail, setImageStepDetail] = useState('')
  const [pullLines, setPullLines] = useState<string[]>([])
  const [showPullLog, setShowPullLog] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    setPhase('form')
    setImageStep('pending')
    setRunStep('pending')
    setImageStepTitle('')
    setImageStepDetail('')
    setPullLines([])
    setShowPullLog(false)
    setProgressError(null)
    pendingParamsRef.current = null
    pendingForcePullRef.current = false
    pullStreamIdRef.current = null
  }, [])

  const cancelPull = useCallback(async () => {
    if (!pullStreamIdRef.current) return
    try {
      await commands.cancelStream(pullStreamIdRef.current)
    } catch {
      /* ignore */
    }
    pullStreamIdRef.current = null
  }, [])

  const handleBackFromProgress = useCallback(async () => {
    await cancelPull()
    setPhase('form')
    setImageStep('pending')
    setRunStep('pending')
    setProgressError(null)
    setPullLines([])
    setShowPullLog(false)
  }, [cancelPull])

  const executeRun = useCallback(
    async (params: RunContainer, forcePull: boolean, localImages: Image[]) => {
      const img = params.image.trim()
      const needsPull = forcePull || !imageRefExistsOnHost(img, localImages)

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
        qc.invalidateQueries({ queryKey: qk.containers(serverId) })
        qc.invalidateQueries({ queryKey: qk.images(serverId) })
        onSuccess()
      } catch (e) {
        if (!mountedRef.current) return
        const msg = String(e)
        setProgressError(msg)
        toast.error(msg)
        setRunStep((prev) => (prev === 'active' ? 'error' : prev))
        setImageStep((prev) => (prev === 'active' ? 'error' : prev))
      }
    },
    [serverId, qc, onSuccess]
  )

  const submit = useCallback(
    (params: RunContainer, forcePull: boolean, localImages: Image[]) => {
      pendingParamsRef.current = params
      pendingForcePullRef.current = forcePull
      setPhase('progress')
      void executeRun(params, forcePull, localImages)
    },
    [executeRun]
  )

  const isStepActive = imageStep === 'active' || runStep === 'active'

  return {
    phase,
    imageStep,
    runStep,
    imageStepTitle,
    imageStepDetail,
    pullLines,
    showPullLog,
    progressError,
    isStepActive,
    reset,
    submit,
    handleBackFromProgress,
  }
}
