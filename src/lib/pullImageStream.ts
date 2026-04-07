import { commands } from '@/types/app-bindings'
import { appendSshStreamChunkToLines, subscribeDockerSshStream } from '@/lib/dockerSshStream'

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

  let resolveDone!: (v: boolean) => void
  const donePromise = new Promise<boolean>((r) => {
    resolveDone = r
  })

  const unlisten = await subscribeDockerSshStream(
    streamId,
    (chunk) => {
      lines = appendSshStreamChunkToLines(lines, chunk)
      onLogsUpdate([...lines])
    },
    resolveDone
  )

  const success = await donePromise
  unlisten()

  if (!success) {
    try {
      await commands.cancelStream(streamId)
    } catch {
      /* ignore */
    }
    lines = [...lines, '', '✗ 拉取失败']
    onLogsUpdate(lines)
    throw new Error('拉取失败')
  }

  lines = [...lines, '', '✓ 拉取成功']
  onLogsUpdate(lines)
}
