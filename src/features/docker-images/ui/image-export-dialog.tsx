import { zodResolver } from '@hookform/resolvers/zod'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Download, FolderOpen, Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useExportImage } from '@/features/docker-images/api/use-images'
import {
  imageExportDefaultValues,
  imageExportFormSchema,
  type ImageExportFormValues,
} from '@/features/docker-images/model/image-export-schema'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { toast } from '@/shared/components/toast'
import { Button } from '@/shared/ui/button'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { events, type Image } from '@/types/app-bindings'

interface ImageExportDialogProps {
  serverId: string
  image: Image | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ImageExportDialog({ serverId, image, open, onOpenChange }: ImageExportDialogProps) {
  const formId = useId()
  const exportImage = useExportImage(serverId)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const activeExportIdRef = useRef<string | null>(null)
  const form = useForm<ImageExportFormValues>({
    resolver: zodResolver(imageExportFormSchema),
    defaultValues: imageExportDefaultValues(image),
    mode: 'onSubmit',
  })

  const exporting = exportImage.isPending
  const [progress, setProgress] = useState<{
    exportId: string
    transferred: string
    total: string | null
    percent: number | null
  } | null>(null)

  useEffect(() => {
    if (!open) return
    form.reset(imageExportDefaultValues(image))
    activeExportIdRef.current = null
    setProgress(null)
    queueMicrotask(() => nameInputRef.current?.focus())
  }, [open, image, form])

  useEffect(() => {
    if (!open) return
    let active = true
    let unlisten: (() => void) | undefined
    void events.imageExportProgress
      .listen((event) => {
        const payload = event.payload
        if (!active) return
        if (activeExportIdRef.current && payload.export_id !== activeExportIdRef.current) return
        setProgress((current) => {
          if (current && payload.export_id !== current.exportId) return current
          return {
            exportId: payload.export_id,
            transferred: payload.transferred,
            total: payload.total,
            percent: payload.percent,
          }
        })
      })
      .then((fn) => {
        unlisten = fn
      })
    return () => {
      active = false
      unlisten?.()
    }
  }, [open])

  const handlePickDirectory = async () => {
    const current = form.getValues('directory').trim()
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: current || undefined,
    })
    if (typeof selected === 'string' && selected.trim()) {
      form.setValue('directory', selected, { shouldDirty: true, shouldValidate: true })
    }
  }

  const handleExport = createToastFormSubmit(form, async (values) => {
    if (!image) return
    const exportId = crypto.randomUUID()
    activeExportIdRef.current = exportId
    setProgress(null)
    try {
      await exportImage.mutateAsync({
        exportId,
        imageId: image.id,
        directory: values.directory.trim(),
        fileName: values.fileName.trim(),
      })
      toast.success('镜像已导出到本地')
      activeExportIdRef.current = null
      onOpenChange(false)
    } catch (error) {
      activeExportIdRef.current = null
      setProgress(null)
      throw error
    }
  })

  const progressPercent = progress?.percent ?? null

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && exporting) return
        onOpenChange(next)
      }}
      title="导出镜像"
      icon={Download}
      disableClose={exporting}
      showCloseButton
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            取消
          </Button>
          <Button type="submit" form={`${formId}-export`} disabled={exporting || !image}>
            {exporting ? (
              <>
                <Loader2 className="animate-spin" />
                导出中
              </>
            ) : (
              <>
                <Download />
                导出到本地
              </>
            )}
          </Button>
        </div>
      }
    >
      <form id={`${formId}-export`} onSubmit={handleExport} className="space-y-4">
        <FieldGroup className="gap-4">
          <Controller
            control={form.control}
            name="fileName"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldContent>
                  <FieldTitle>文件名</FieldTitle>
                  <Input
                    {...field}
                    ref={(el) => {
                      field.ref(el)
                      nameInputRef.current = el
                    }}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={`${formId}-name-desc`}
                    placeholder="nginx_latest.tar"
                    disabled={exporting}
                  />
                  <FieldDescription id={`${formId}-name-desc`}>可自定义名称；未带 `.tar` 会自动补上。</FieldDescription>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="directory"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldContent className="gap-2">
                  <FieldTitle>保存目录</FieldTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      aria-describedby={`${formId}-dir-desc`}
                      placeholder="请选择本地目录"
                      disabled={exporting}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handlePickDirectory()}
                      disabled={exporting}
                    >
                      <FolderOpen />
                      选择目录
                    </Button>
                  </div>
                  <FieldDescription id={`${formId}-dir-desc`}>镜像会以 tar 包形式保存到该目录。</FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
        </FieldGroup>

        {exporting && progress ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">导出进度</span>
              <span className="text-muted-foreground">
                {progress
                  ? progress.total
                    ? `${progress.transferred} / ${progress.total}`
                    : progress.transferred
                  : '准备中...'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/70">
              <div
                className={
                  progressPercent === null ? 'h-full w-0 rounded-full bg-primary' : 'h-full rounded-full bg-primary'
                }
                style={progressPercent === null ? undefined : { width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}
      </form>
    </StandardDialog>
  )
}
