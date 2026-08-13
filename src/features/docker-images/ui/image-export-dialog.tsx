import { zodResolver } from '@hookform/resolvers/zod'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Download, FolderOpen, Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useExportImage } from '@/features/docker-images/api/use-images'
import {
  imageExportDefaultValues,
  imageExportFormSchema,
  type ImageExportFormValues,
} from '@/features/docker-images/model/image-export-schema'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { FormFieldHint, FormFieldRow } from '@/shared/components/form-field'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { toast } from '@/shared/components/toast'
import { Button } from '@/shared/ui/button'
import { FieldGroup } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { events, type Image } from '@/types/app-bindings'

interface ImageExportDialogProps {
  serverId: string
  image: Image | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ImageExportDialog({ serverId, image, open, onOpenChange }: ImageExportDialogProps) {
  const { t } = useTranslation()
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
      toast.success(t('ui.images.exported'))
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
      title={t('ui.images.exportTitle')}
      icon={Download}
      disableClose={exporting}
      showCloseButton
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            {t('ui.common.cancel')}
          </Button>
          <Button type="submit" form={`${formId}-export`} disabled={exporting || !image}>
            {exporting ? (
              <>
                <Loader2 className="animate-spin" />
                {t('ui.images.exporting')}
              </>
            ) : (
              <>
                <Download />
                {t('ui.images.exportToLocal')}
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
              <FormFieldRow
                label={t('ui.images.fileName')}
                required
                invalid={fieldState.invalid}
                variant="title"
                description={<FormFieldHint id={`${formId}-name-desc`}>{t('ui.images.fileNameHint')}</FormFieldHint>}
              >
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
              </FormFieldRow>
            )}
          />

          <Controller
            control={form.control}
            name="directory"
            render={({ field, fieldState }) => (
              <FormFieldRow
                label={t('ui.images.saveDirectory')}
                required
                invalid={fieldState.invalid}
                variant="title"
                contentClassName="gap-2"
                description={
                  <FormFieldHint id={`${formId}-dir-desc`}>{t('ui.images.saveDirectoryHint')}</FormFieldHint>
                }
              >
                <div className="flex items-center gap-2">
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={`${formId}-dir-desc`}
                    placeholder={t('ui.images.selectDirectoryPlaceholder')}
                    disabled={exporting}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePickDirectory()}
                    disabled={exporting}
                  >
                    <FolderOpen />
                    {t('ui.common.selectDirectory')}
                  </Button>
                </div>
              </FormFieldRow>
            )}
          />
        </FieldGroup>

        {exporting && progress ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">{t('ui.images.exportProgress')}</span>
              <span className="text-muted-foreground">
                {progress
                  ? progress.total
                    ? `${progress.transferred} / ${progress.total}`
                    : progress.transferred
                  : t('ui.common.preparing')}
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
