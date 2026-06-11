import { zodResolver } from '@hookform/resolvers/zod'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { FolderUp, Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useImportImage } from '@/features/docker-images/api/use-images'
import {
  imageImportDefaultValues,
  imageImportFormSchema,
  type ImageImportFormValues,
} from '@/features/docker-images/model/image-import-schema'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { toast } from '@/shared/components/toast'
import { Button } from '@/shared/ui/button'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldTitle } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { events } from '@/types/app-bindings'

interface ImageImportDialogProps {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ImageImportDialog({ serverId, open, onOpenChange }: ImageImportDialogProps) {
  const formId = useId()
  const importImage = useImportImage(serverId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeImportIdRef = useRef<string | null>(null)
  const form = useForm<ImageImportFormValues>({
    resolver: zodResolver(imageImportFormSchema),
    defaultValues: imageImportDefaultValues(),
    mode: 'onSubmit',
  })

  const importing = importImage.isPending
  const [progress, setProgress] = useState<{
    importId: string
    transferred: string
    total: string | null
    percent: number | null
  } | null>(null)

  useEffect(() => {
    if (!open) return
    form.reset(imageImportDefaultValues())
    activeImportIdRef.current = null
    setProgress(null)
    queueMicrotask(() => fileInputRef.current?.focus())
  }, [open, form])

  useEffect(() => {
    if (!open) return
    let active = true
    let unlisten: (() => void) | undefined
    void events.imageImportProgress
      .listen((event) => {
        const payload = event.payload
        if (!active) return
        if (activeImportIdRef.current && payload.import_id !== activeImportIdRef.current) return
        setProgress((current) => {
          if (current && payload.import_id !== current.importId) return current
          return {
            importId: payload.import_id,
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

  const handlePickFile = async () => {
    const current = form.getValues('filePath').trim()
    const selected = await openDialog({
      directory: false,
      multiple: false,
      defaultPath: current || undefined,
      filters: [
        { name: 'Docker Image Archive', extensions: ['tar', 'tgz', 'gz', 'xz', 'zst'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (typeof selected === 'string' && selected.trim()) {
      form.setValue('filePath', selected, { shouldDirty: true, shouldValidate: true })
    }
  }

  const handleImport = form.handleSubmit(async (values) => {
    const importId = crypto.randomUUID()
    activeImportIdRef.current = importId
    setProgress({
      importId,
      transferred: '0 B',
      total: null,
      percent: null,
    })
    await importImage.mutateAsync({
      importId,
      filePath: values.filePath.trim(),
    })
    toast.success('镜像已导入')
    activeImportIdRef.current = null
    onOpenChange(false)
  })

  const progressPercent = progress?.percent ?? null

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && importing) return
        onOpenChange(next)
      }}
      title="导入镜像"
      icon={FolderUp}
      disableClose={importing}
      showCloseButton
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            取消
          </Button>
          <Button type="submit" form={`${formId}-import`} disabled={importing}>
            {importing ? (
              <>
                <Loader2 className="animate-spin" />
                导入中
              </>
            ) : (
              <>
                <FolderUp />
                导入到服务器
              </>
            )}
          </Button>
        </div>
      }
    >
      <form id={`${formId}-import`} onSubmit={handleImport} className="space-y-4">
        <FieldGroup className="gap-4">
          <Controller
            control={form.control}
            name="filePath"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldContent className="gap-2">
                  <FieldTitle>镜像文件</FieldTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      {...field}
                      ref={(el) => {
                        field.ref(el)
                        fileInputRef.current = el
                      }}
                      aria-invalid={fieldState.invalid}
                      aria-describedby={fieldState.error ? `${formId}-file-err` : `${formId}-file-desc`}
                      placeholder="请选择本地镜像 tar 包"
                      disabled={importing}
                    />
                    <Button type="button" variant="outline" onClick={() => void handlePickFile()} disabled={importing}>
                      <FolderUp />
                      选择文件
                    </Button>
                  </div>
                  <FieldDescription id={`${formId}-file-desc`}>
                    支持上传 Docker 镜像包，系统会自动完成远程导入。
                  </FieldDescription>
                  <FieldError id={`${formId}-file-err`} errors={[fieldState.error]} />
                </FieldContent>
              </Field>
            )}
          />
        </FieldGroup>

        {importing ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">导入进度</span>
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
