const STOPPABLE_STATES = new Set(['running', 'restarting'])
const FORCE_REMOVE_STATES = new Set(['running', 'restarting'])

export function canStopContainer(state: string) {
  return STOPPABLE_STATES.has(state.toLowerCase().trim())
}

export function shouldForceRemoveContainer(state: string) {
  return FORCE_REMOVE_STATES.has(state.toLowerCase().trim())
}
