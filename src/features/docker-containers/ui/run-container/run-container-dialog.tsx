import { useCallback, useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Box, Play, X } from 'lucide-react'
import { toast } from 'sonner'
import { commands, type Image, type Network } from '@/types/app-bindings'
import {
  runContainerFormDefaultValues,
  runContainerFormSchema,
  runFormValuesToBuildArgs,
  type RunContainerFormValues,
} from '@/features/docker-containers/model/run-container-schema'
import { buildRunParamsFromForm } from '@/features/docker-containers/lib/docker-run-cli'
import { listSelectableImageRefs } from '@/shared/lib/docker-image-ref'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { FieldError, FieldGroup } from '@/shared/ui/field'
import { modalDialogContent } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'
import { BasicSection } from '@/features/docker-containers/ui/run-container/sections/basic-section'
import { PortSection } from '@/features/docker-containers/ui/run-container/sections/port-section'
import { NetworkSection } from '@/features/docker-containers/ui/run-container/sections/network-section'
import { VolumeSection } from '@/features/docker-containers/ui/run-container/sections/volume-section'
import { CommandSection } from '@/features/docker-containers/ui/run-container/sections/command-section'
import { EnvLabelsSection } from '@/features/docker-containers/ui/run-container/sections/env-labels-section'
import { ResourcesSection } from '@/features/docker-containers/ui/run-container/sections/resources-section'
import { OptionsSection } from '@/features/docker-containers/ui/run-container/sections/options-section'
import { RestartSection } from '@/features/docker-containers/ui/run-container/sections/restart-section'
import { PullProgress } from '@/features/docker-containers/ui/run-container/pull-progress'
import { useRunContainerFlow } from '@/features/docker-containers/ui/run-container/use-run-container'

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

  const form = useForm<RunContainerFormValues>({
    resolver: zodResolver(runContainerFormSchema),
    defaultValues: runContainerFormDefaultValues,
    mode: 'onSubmit',
  })

  const restartPolicy = form.watch('restartPolicy')

  const handleSuccess = useCallback(() => {
    onSuccess?.()
    onOpenChange(false)
  }, [onSuccess, onOpenChange])

  const flow = useRunContainerFlow(serverId, handleSuccess)

  useEffect(() => {
    if (!open) return
    flow.reset()
    form.reset(runContainerFormDefaultValues)

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
        toast.error(String(e))
      }
    },
    [flow, images]
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
      <DialogContent className={cn(modalDialogContent, 'h-[720px] w-[680px] max-w-none!')} showCloseButton={false}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex shrink-0 text-primary [&_svg]:size-4">
            <Box />
          </span>
          <DialogTitle className="flex-1 text-sm leading-none font-semibold text-foreground">运行容器</DialogTitle>
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
              className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
            >
              <FieldGroup className="gap-6">
                {form.formState.errors.root?.message ? (
                  <FieldError
                    className="rounded-lg border border-destructive/30 bg-destructive/10 p-3"
                    errors={[form.formState.errors.root]}
                  />
                ) : null}

                <BasicSection
                  control={form.control}
                  imageOptions={imageOptions}
                  imagesLoading={imagesLoading}
                  onToggleManual={(on) => {
                    if (on) return
                    const cur = form.getValues('image')
                    if (cur && !imageOptions.includes(cur)) form.setValue('image', '')
                  }}
                />
                <PortSection control={form.control} />
                <NetworkSection control={form.control} networks={networks} networksLoading={networksLoading} />
                <VolumeSection control={form.control} />
                <CommandSection control={form.control} />
                <EnvLabelsSection control={form.control} />
                <ResourcesSection control={form.control} />
                <OptionsSection control={form.control} />
                <RestartSection control={form.control} restartPolicy={restartPolicy} />
              </FieldGroup>
            </form>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
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
            pullLines={flow.pullLines}
            showPullLog={flow.showPullLog}
            error={flow.progressError}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
