import type { ImagePullProgress } from '@/types/app-bindings'

export interface ImagePullLayerViewModel {
  id: string
  status: string
  current: string | null
  total: string | null
  percent: number | null
  done: boolean
}

export interface ImagePullViewModel {
  image: string
  status: string
  detail: string | null
  completedLayers: number
  totalLayers: number
  percent: number | null
  layers: ImagePullLayerViewModel[]
}

export function toImagePullViewModel(progress: ImagePullProgress): ImagePullViewModel {
  const layers = [...progress.layers]
    .map((layer) => ({
      id: layer.id,
      status: layer.status,
      current: layer.current,
      total: layer.total,
      percent: layer.percent,
      done:
        layer.status === 'Pull complete' || layer.status === 'Already exists' || layer.status === 'Download complete',
    }))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      return a.id.localeCompare(b.id)
    })

  const activeLayer = layers.find((layer) => !layer.done && layer.status.trim().length > 0)
  const headerStatus = progress.status === '准备拉取镜像' && activeLayer ? activeLayer.status : progress.status
  const headerDetail =
    progress.status === '准备拉取镜像' && activeLayer
      ? [activeLayer.current, activeLayer.total].filter(Boolean).join(' / ') || progress.detail
      : progress.detail

  const denominator = Math.max(progress.total_layers, layers.length)
  const progressSum = layers.reduce((sum, layer) => sum + (layer.percent ?? (layer.done ? 100 : 0)), 0)
  const percent =
    headerStatus === '拉取完成'
      ? 100
      : denominator > 0
        ? Math.round(progressSum / denominator)
        : progress.completed_layers > 0
          ? 100
          : null

  return {
    image: progress.image,
    status: headerStatus,
    detail: headerDetail,
    completedLayers: progress.completed_layers,
    totalLayers: progress.total_layers,
    percent,
    layers,
  }
}
