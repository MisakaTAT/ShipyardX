import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { commands } from '@/types/app-bindings'
import { pullImage } from '@/features/docker-images/lib/pull-image-stream'
import {
  imagePullDefaultValues,
  imagePullFormSchema,
  type ImagePullFormValues,
} from '@/features/docker-images/model/image-pull-schema'
import { Download, Loader2, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Field, FieldContent, FieldError, FieldGroup } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { modalDialogContent } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'
import { qk } from '@/shared/api/query-keys'

export interface ImagePullDialogProps {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void | Promise<void>
}

export default function ImagePullDialog({ serverId, open, onOpenChange, onSuccess }: ImagePullDialogProps) {
  const formId = useId()
  const qc = useQueryClient()
  const form = useForm<ImagePullFormValues>({
    resolver: zodResolver(imagePullFormSchema),
    defaultValues: imagePullDefaultValues(),
    mode: 'onSubmit',
  })
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'pulling' | 'success' | 'error'>('idle')
  const [pullId, setPullId] = useState<string | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pulling = status === 'pulling'

  useEffect(() => {
    if (!open) return
    form.reset(imagePullDefaultValues())
    setLines([])
    setStatus('idle')
    setPullId(null)
    queueMicrotask(() => inputRef.current?.focus())
  }, [open, form])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

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

    try {
      await pullImage(serverId, img, setLines, { onStreamId: (id) => setPullId(id) })
      setPullId(null)
      setStatus('success')
      qc.invalidateQueries({ queryKey: qk.images(serverId) })
      await onSuccess?.()
    } catch {
      setStatus('error')
      setPullId(null)
    }
  }

  const handlePull = form.handleSubmit(async (values) => {
    await runPull(values.image.trim())
  })

  const handleClose = async () => {
    await cleanup()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pulling) void handleClose()
      }}
    >
      <DialogContent className={cn(modalDialogContent)} showCloseButton={false}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex shrink-0 text-primary [&_svg]:size-4">
            <Download />
          </span>
          <DialogTitle className="flex-1 text-sm leading-none font-semibold text-foreground">拉取镜像</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => void handleClose()} disabled={pulling}>
            <X className="size-4" />
          </Button>
        </div>

        <form id={`${formId}-pull`} onSubmit={handlePull} className="contents">
          <div className="space-y-3 p-4">
            <FieldGroup className="gap-2">
              <Controller
                control={form.control}
                name="image"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="w-full">
                    <FieldContent className="gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          id={`${formId}-image`}
                          aria-invalid={fieldState.invalid}
                          aria-describedby={fieldState.error ? `${formId}-image-err` : undefined}
                          {...field}
                          ref={(el) => {
                            field.ref(el)
                            inputRef.current = el
                          }}
                          placeholder="nginx:latest"
                          disabled={pulling}
                        />
                        <Button type="submit" form={`${formId}-pull`} className="shrink-0" disabled={pulling}>
                          {pulling ? (
                            <>
                              <Loader2 className="animate-spin" />
                              拉取中
                            </>
                          ) : (
                            <>
                              <Download />
                              拉取
                            </>
                          )}
                        </Button>
                      </div>
                      <FieldError id={`${formId}-image-err`} className="mt-0" errors={[fieldState.error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </FieldGroup>

            {lines.length > 0 ? (
              <div ref={outputRef} className="h-52 overflow-y-auto rounded-lg border border-border bg-background p-3">
                <pre className="font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-foreground">
                  {lines.join('\n')}
                </pre>
              </div>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
