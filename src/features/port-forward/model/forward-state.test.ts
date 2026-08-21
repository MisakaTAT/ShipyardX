import { describe, expect, it } from 'vitest'
import type { PortForward } from '@/types/app-bindings'
import { aggregateState, ruleState } from '@/features/port-forward/model/forward-state'

function rule(over: Partial<PortForward>): PortForward {
  return {
    id: 'r',
    server_id: 's1',
    container_id: 'c1',
    container_name: null,
    enabled: true,
    protocol: 'tcp',
    container_port: 80,
    remote_host: '127.0.0.1',
    remote_port: 80,
    local_port: 8080,
    bind_address: '127.0.0.1',
    running: false,
    tx_speed_bps: 0,
    rx_speed_bps: 0,
    last_error: null,
    ...over,
  }
}

const failure = { error: { code: 'e', kind: 'internal', params: {}, detail: null, retryable: true }, at_ms: 1 } as const

describe('ruleState', () => {
  it('puts a recorded error ahead of the running flag', () => {
    expect(ruleState(rule({ running: true, last_error: failure }))).toBe('failed')
  })

  it('separates running, waiting and disabled', () => {
    expect(ruleState(rule({ running: true }))).toBe('running')
    expect(ruleState(rule({ enabled: true }))).toBe('pending')
    expect(ruleState(rule({ enabled: false }))).toBe('disabled')
  })
})

describe('aggregateState', () => {
  it('reports the most urgent state in the group', () => {
    expect(aggregateState([rule({ running: true }), rule({ last_error: failure })])).toBe('failed')
    expect(aggregateState([rule({ enabled: false }), rule({ running: true })])).toBe('running')
    expect(aggregateState([rule({ enabled: false }), rule({ enabled: true })])).toBe('pending')
    expect(aggregateState([rule({ enabled: false })])).toBe('disabled')
  })

  it('does not let a later pending rule mask a running one', () => {
    expect(aggregateState([rule({ running: true }), rule({ enabled: true })])).toBe('running')
  })

  it('treats an empty group as disabled', () => {
    expect(aggregateState([])).toBe('disabled')
  })
})
