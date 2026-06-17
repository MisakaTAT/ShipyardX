import { commands, events, type AppError, type ImagePullDone, type ImagePullProgress } from '@/types/app-bindings'

export interface PullImageOptions {
  onStreamId?: (streamId: string) => void
}

export interface PullImageCallbacks {
  onProgress: (progress: ImagePullProgress) => void
  onDone?: (result: ImagePullDone) => void
}

export async function pullImage(
  serverId: string,
  image: string,
  callbacks: PullImageCallbacks,
  options?: PullImageOptions
): Promise<ImagePullDone> {
  const streamId = await commands.startImagePull(serverId, image)
  options?.onStreamId?.(streamId)

  let resolveDone!: (value: ImagePullDone) => void
  const donePromise = new Promise<ImagePullDone>((resolve) => {
    resolveDone = resolve
  })

  const unProgress = await events.imagePullProgress.listen((event) => {
    if (event.payload.stream_id !== streamId) return
    callbacks.onProgress(event.payload)
  })

  const unDone = await events.imagePullDone.listen((event) => {
    if (event.payload.stream_id !== streamId) return
    resolveDone(event.payload)
  })

  const cleanup = () => {
    unProgress()
    unDone()
  }

  const result = await donePromise
  cleanup()
  callbacks.onDone?.(result)

  if (!result.success) {
    try {
      await commands.cancelStream(streamId)
    } catch {
      /* ignore */
    }
    throw (
      result.error ??
      ({
        code: 'image.pull_failed',
        kind: 'unavailable' as const,
        message: result.final_status ?? '拉取失败',
        detail: null,
        retryable: false,
        action: null,
      } satisfies AppError)
    )
  }

  return result
}
