import { commands, type AppError } from '@/types/app-bindings'
import { appendSshStreamChunkToLines, subscribeDockerSshStream } from '@/features/docker-terminal/lib/docker-ssh-stream'

export async function pullImage(
  serverId: string,
  image: string,
  onLogsUpdate: (lines: string[]) => void,
  options?: { onStreamId?: (streamId: string) => void }
): Promise<void> {
  let lines: string[] = [`> docker pull ${image}`, '']
  onLogsUpdate(lines)

  const streamId = await commands.startImagePull(serverId, image)
  options?.onStreamId?.(streamId)

  let resolveDone!: (v: { success: boolean; error?: AppError }) => void
  const donePromise = new Promise<{ success: boolean; error?: AppError }>((r) => {
    resolveDone = r
  })

  const unlisten = await subscribeDockerSshStream(
    streamId,
    (chunk) => {
      lines = appendSshStreamChunkToLines(lines, chunk)
      onLogsUpdate([...lines])
    },
    (payload) => {
      resolveDone({
        success: payload.success,
        error: payload.error ?? undefined,
      })
    }
  )

  const { success, error } = await donePromise
  unlisten()

  if (!success) {
    try {
      await commands.cancelStream(streamId)
    } catch {
      /* ignore */
    }
    lines = [...lines, '', '✗ 拉取失败']
    onLogsUpdate(lines)
    throw (
      error ?? {
        code: 'image.pull_failed',
        kind: 'unavailable' as const,
        message: '拉取失败',
        detail: null,
        retryable: false,
        action: null,
      }
    )
  }

  lines = [...lines, '', '✓ 拉取成功']
  onLogsUpdate(lines)
}
