import { listen } from '@tauri-apps/api/event'
import { cancelStream, startImagePull } from '@/lib/commands'

/**
 * 拉取镜像并流式更新日志行（与 ImagePanel PullModal 拼接逻辑一致）。
 * `onStreamId` 可用于用户取消时 `cancelStream`。
 */
export async function pullImage(
  serverId: string,
  image: string,
  onLogsUpdate: (lines: string[]) => void,
  options?: { onStreamId?: (streamId: string) => void },
): Promise<void> {
  let lines: string[] = [`> docker pull ${image}`, '']
  onLogsUpdate(lines)

  const streamId = await startImagePull({ serverId, image })
  options?.onStreamId?.(streamId)

  const unData = await listen<string>(`pull-data:${streamId}`, (event) => {
    const chunk = event.payload
    const newLines = chunk.split('\n')
    if (lines.length > 0 && !lines[lines.length - 1].endsWith('\n')) {
      const updated = [...lines]
      updated[updated.length - 1] += newLines[0]
      lines = [...updated, ...newLines.slice(1)]
    } else {
      lines = [...lines, ...newLines]
    }
    onLogsUpdate([...lines])
  })

  let resolveDone!: (v: boolean) => void
  const donePromise = new Promise<boolean>((r) => {
    resolveDone = r
  })
  const unDone = await listen<boolean>(`pull-done:${streamId}`, (e) => {
    resolveDone(e.payload)
  })

  const success = await donePromise
  unData()
  unDone()

  if (!success) {
    try {
      await cancelStream({ streamId })
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
