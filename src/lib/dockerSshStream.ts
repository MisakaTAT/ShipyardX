import { events } from '@/types/app-bindings'

export function appendSshStreamChunkToLines(lines: string[], chunk: string): string[] {
  const newLines = chunk.split('\n')
  if (lines.length > 0 && !lines[lines.length - 1].endsWith('\n')) {
    const updated = [...lines]
    updated[updated.length - 1] += newLines[0]
    return [...updated, ...newLines.slice(1)]
  }
  return [...lines, ...newLines]
}

export async function subscribeDockerSshStream(
  streamId: string,
  onChunk: (chunk: string) => void,
  onDone: (success: boolean) => void,
): Promise<() => void> {
  const unChunk = await events.dockerSshStreamChunk.listen((e) => {
    if (e.payload.stream_id !== streamId) return
    onChunk(e.payload.chunk)
  })
  const unDone = await events.dockerSshStreamDone.listen((e) => {
    if (e.payload.stream_id !== streamId) return
    onDone(e.payload.success)
  })
  return () => {
    unChunk()
    unDone()
  }
}
