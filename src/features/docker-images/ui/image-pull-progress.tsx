import type { ImagePullViewModel } from '@/features/docker-images/lib/image-pull-view'

interface ImagePullProgressProps {
  progress: ImagePullViewModel | null
}

function LayerRow({ layer }: { layer: ImagePullViewModel['layers'][number] }) {
  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`size-1.5 shrink-0 rounded-full ${
                layer.done ? 'bg-emerald-500' : layer.percent != null ? 'bg-primary' : 'bg-muted-foreground/50'
              }`}
            />
            <p className="truncate font-mono text-[11px] text-foreground/90">{layer.id}</p>
          </div>
          <p className="mt-1 pl-3.5 text-[11px] text-muted-foreground">{layer.status}</p>
        </div>
        <div className="shrink-0 pl-2 text-right">
          {layer.percent != null ? (
            <p className="text-[11px] font-medium text-foreground">{Math.round(layer.percent)}%</p>
          ) : null}
          {layer.current || layer.total ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {[layer.current, layer.total].filter(Boolean).join(' / ')}
            </p>
          ) : null}
        </div>
      </div>
      {layer.percent != null ? (
        <div className="mt-2 ml-3.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${layer.percent}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

export function ImagePullProgressPanel({ progress }: ImagePullProgressProps) {
  if (!progress) return null

  return (
    <div className="rounded-xl border border-border/75 bg-background">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{progress.image}</p>
            {progress.percent != null ? (
              <span className="text-[11px] font-medium text-muted-foreground">{progress.percent}%</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="tracking-[0.14em] uppercase">{progress.status}</span>
            {progress.detail ? (
              <>
                <span className="text-border">/</span>
                <span className="truncate">{progress.detail}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {progress.layers.length > 0 ? (
        <div className="max-h-72 overflow-y-auto px-4 py-2">
          <div>
            {progress.layers.map((layer, index) => (
              <div key={layer.id} className={index > 0 ? 'border-t border-border/55' : ''}>
                <LayerRow layer={layer} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
