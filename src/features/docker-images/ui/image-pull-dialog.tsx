import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { commands } from '@/types/app-bindings'
import { pullImage } from '@/features/docker-images/lib/pull-image-stream'
import { toImagePullViewModel, type ImagePullViewModel } from '@/features/docker-images/lib/image-pull-view'
import {
  imagePullDefaultValues,
  imagePullFormSchema,
  type ImagePullFormValues,
} from '@/features/docker-images/model/image-pull-schema'
import { Download, Loader2 } from 'lucide-react'
import { FormFieldRow } from '@/shared/components/form-field'
import { getErrorMessage } from '@/shared/lib/errors'
import { createToastFormSubmit } from '@/shared/lib/form-error-toast'
import { Button } from '@/shared/ui/button'
import { FieldGroup } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { qk } from '@/shared/api/query-keys'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { ImagePullProgressPanel } from '@/features/docker-images/ui/image-pull-progress'

export interface ImagePullDialogProps {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void | Promise<void>
}

export default function ImagePullDialog({ serverId, open, onOpenChange, onSuccess }: ImagePullDialogProps) {
  const { t } = useTranslation()
  const formId = useId()
  const qc = useQueryClient()
  const form = useForm<ImagePullFormValues>({
    resolver: zodResolver(imagePullFormSchema),
    defaultValues: imagePullDefaultValues(),
    mode: 'onSubmit',
  })
  const [progress, setProgress] = useState<ImagePullViewModel | null>(null)
  const [status, setStatus] = useState<'idle' | 'pulling' | 'success' | 'error'>('idle')
  const [pullId, setPullId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const pulling = status === 'pulling'

  useEffect(() => {
    if (!open) return
    form.reset(imagePullDefaultValues())
    setProgress(null)
    setStatus('idle')
    setPullId(null)
    setErrorMessage(null)
  }, [open, form])

  const cleanup = useCallback(
    async (id?: string | null) => {
      const target = id ?? pullId
      if (target) {
        try {
          await commands.cancelStream(target)
        } catch {
          /* ignore */
        }
        setPullId(null)
      }
    },
    [pullId]
  )

  const runPull = async (img: string) => {
    await cleanup()
    setStatus('pulling')
    setErrorMessage(null)
    setProgress(null)

    try {
      await pullImage(
        serverId,
        img,
        {
          onProgress: (next) => setProgress(toImagePullViewModel(next)),
        },
        { onStreamId: (id) => setPullId(id) }
      )
      setPullId(null)
      setStatus('success')
      qc.invalidateQueries({ queryKey: qk.images(serverId) })
      await onSuccess?.()
    } catch (error) {
      setStatus('error')
      setPullId(null)
      setErrorMessage(getErrorMessage(error))
    }
  }

  const handlePull = createToastFormSubmit(form, async (values) => {
    await runPull(values.image.trim())
  })

  const handleClose = async () => {
    await cleanup()
    onOpenChange(false)
  }

  return (
    <StandardDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pulling) return
        if (!next) void handleClose()
        else onOpenChange(true)
      }}
      title={t('ui.images.pull')}
      icon={Download}
      disableClose={pulling}
      showCloseButton
      footer={null}
    >
      <form id={`${formId}-pull`} onSubmit={handlePull} className="contents">
        <div className="space-y-3">
          <FieldGroup className="gap-2">
            <Controller
              control={form.control}
              name="image"
              render={({ field, fieldState }) => (
                <FormFieldRow
                  label={t('ui.images.imageRef')}
                  required
                  invalid={fieldState.invalid}
                  variant="title"
                  className="w-full"
                  contentClassName="gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${formId}-image`}
                      aria-invalid={fieldState.invalid}
                      {...field}
                      placeholder="nginx:latest"
                      disabled={pulling}
                    />
                    <Button type="submit" form={`${formId}-pull`} className="shrink-0" disabled={pulling}>
                      {pulling ? (
                        <>
                          <Loader2 className="animate-spin" />
                          {t('ui.images.pulling')}
                        </>
                      ) : (
                        <>
                          <Download />
                          {t('ui.images.pullAction')}
                        </>
                      )}
                    </Button>
                  </div>
                </FormFieldRow>
              )}
            />
          </FieldGroup>

          <ImagePullProgressPanel progress={progress} />

          {errorMessage ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </form>
    </StandardDialog>
  )
}
