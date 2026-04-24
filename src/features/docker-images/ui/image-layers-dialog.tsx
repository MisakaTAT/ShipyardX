import { useEffect, useState } from 'react'
import { commands, type Image, type ImageLayer } from '@/types/app-bindings'
import { Layers, Loader2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { formatUnixSeconds } from '@/shared/lib/datetime'
import { formatBytes } from '@/shared/lib/format'
import { modalDialogContent } from '@/shared/styles/variants'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

export interface ImageLayersDialogProps {
  serverId: string
  open: boolean
  image: Image | null
  onOpenChange: (open: boolean) => void
}

export default function ImageLayersDialog({ serverId, open, image, onOpenChange }: ImageLayersDialogProps) {
  const [layers, setLayers] = useState<ImageLayer[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !image) return
    let cancelled = false
    setLayers(null)
    setError(null)
    void (async () => {
      try {
        const hist = await commands.getImageHistory(serverId, image.id)
        if (!cancelled) setLayers(hist ?? [])
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, image, serverId])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setLayers(null)
          setError(null)
        }
      }}
    >
      <DialogContent className={cn(modalDialogContent, 'max-h-[720px] w-[920px] max-w-none!')} showCloseButton={false}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3">
          <span className="flex shrink-0 text-primary [&_svg]:size-4">
            <Layers />
          </span>
          <DialogTitle className="flex-1 text-[15px] leading-none font-semibold text-foreground">Layers</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-5">
          {error ? (
            <div className="text-sm text-red-500">{error}</div>
          ) : layers ? (
            layers.length > 0 ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  {layers.map((l, idx) => {
                    const n = layers.length - idx
                    const shortId = l.id?.replace('sha256:', '').slice(0, 12) || '-'
                    return (
                      <details key={`${l.id}-${idx}`} className="rounded-lg border bg-background/50 px-3 py-2">
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="font-medium">#{n}</span>
                              <span className="font-mono text-xs text-muted-foreground">{shortId}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatBytes(l.size)}</span>
                          </div>
                          <div className="mt-1 line-clamp-1 font-mono text-xs text-muted-foreground">{l.command || '-'}</div>
                        </summary>
                        <div className="mt-2 grid gap-2 text-xs">
                          <div className="grid grid-cols-[6rem_1fr] gap-2">
                            <div className="text-muted-foreground">Created</div>
                            <div>{formatUnixSeconds(l.created_ts)}</div>
                          </div>
                          <div className="grid grid-cols-[6rem_1fr] gap-2">
                            <div className="text-muted-foreground">Size</div>
                            <div>{formatBytes(l.size)}</div>
                          </div>
                          <div className="grid grid-cols-[6rem_1fr] gap-2">
                            <div className="text-muted-foreground">Command</div>
                            <div className="font-mono break-all">{l.command || '-'}</div>
                          </div>
                          {l.comment ? (
                            <div className="grid grid-cols-[6rem_1fr] gap-2">
                              <div className="text-muted-foreground">Comment</div>
                              <div className="break-all">{l.comment}</div>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">无 Layers 信息</div>
            )
          ) : (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

