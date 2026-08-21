import type { PortForward } from '@/types/app-bindings'

export type ForwardState = 'failed' | 'running' | 'pending' | 'disabled'

export function ruleState(rule: PortForward): ForwardState {
  if (rule.last_error) return 'failed'
  if (rule.running) return 'running'
  return rule.enabled ? 'pending' : 'disabled'
}

export function aggregateState(rules: PortForward[]): ForwardState {
  let seen: ForwardState = 'disabled'
  for (const rule of rules) {
    const state = ruleState(rule)
    if (state === 'failed') return 'failed'
    if (state === 'running') seen = 'running'
    else if (state === 'pending' && seen !== 'running') seen = 'pending'
  }
  return seen
}
