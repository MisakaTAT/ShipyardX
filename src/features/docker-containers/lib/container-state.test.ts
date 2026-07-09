import { describe, expect, it } from 'vitest'
import { canStopContainer, shouldForceRemoveContainer } from '@/features/docker-containers/lib/container-state'

describe('container state helpers', () => {
  it('allows stopping restarting containers', () => {
    expect(canStopContainer('restarting')).toBe(true)
  })

  it('forces removal for restarting containers', () => {
    expect(shouldForceRemoveContainer('restarting')).toBe(true)
  })

  it('does not force removal for exited containers', () => {
    expect(shouldForceRemoveContainer('exited')).toBe(false)
  })
})
