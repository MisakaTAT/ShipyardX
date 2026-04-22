import { ToneBadge } from '@/shared/components'
import type { BadgeTone } from '@/shared/styles/variants'

const TONE_BY_STATE: Record<string, BadgeTone> = {
  running: 'success',
  exited: 'danger',
  dead: 'danger',
  paused: 'warning',
  restarting: 'pending',
  removing: 'pending',
  created: 'info',
}

const LABEL_BY_STATE: Record<string, string> = {
  created: '已创建',
  running: '运行中',
  paused: '已暂停',
  restarting: '重启中',
  removing: '删除中',
  exited: '已停止',
  dead: '已停止',
}

export function ContainerStateBadge({ state }: { state: string }) {
  const s = state.toLowerCase().trim()
  const tone = TONE_BY_STATE[s] ?? 'muted'
  const label = LABEL_BY_STATE[s] ?? state
  return (
    <ToneBadge tone={tone} dot>
      {label}
    </ToneBadge>
  )
}
