import { useTranslation } from 'react-i18next'
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

type StateLabelKey = `ui.containers.state${'Created' | 'Running' | 'Paused' | 'Restarting' | 'Removing' | 'Exited'}`

const LABEL_KEY_BY_STATE: Record<string, StateLabelKey> = {
  created: 'ui.containers.stateCreated',
  running: 'ui.containers.stateRunning',
  paused: 'ui.containers.statePaused',
  restarting: 'ui.containers.stateRestarting',
  removing: 'ui.containers.stateRemoving',
  exited: 'ui.containers.stateExited',
  dead: 'ui.containers.stateExited',
}

export function ContainerStateBadge({ state }: { state: string }) {
  const { t } = useTranslation()
  const s = state.toLowerCase().trim()
  const tone = TONE_BY_STATE[s] ?? 'muted'
  const labelKey = LABEL_KEY_BY_STATE[s]
  const label = labelKey ? t(labelKey) : state
  return (
    <ToneBadge tone={tone} dot>
      {label}
    </ToneBadge>
  )
}
