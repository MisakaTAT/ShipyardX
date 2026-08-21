import { describe, expect, it } from 'vitest'
import type { PortForward, ServerConfig } from '@/types/app-bindings'
import { groupForwards } from '@/features/port-forward/model/group-forwards'
import {
  ALL_SCOPE,
  buildSections,
  containerLabel,
  isSameScope,
  resolveScope,
  ruleContainerLabel,
  scopeKey,
  summarizeRules,
} from '@/features/port-forward/model/port-forward-scope'

function rule(over: Partial<PortForward> & Pick<PortForward, 'id' | 'server_id' | 'container_id'>): PortForward {
  return {
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

function server(id: string, name: string, host: string): ServerConfig {
  return { id, name, host, port: 22, username: 'root', auth_type: 'key', password: null, key_path: null }
}

const servers = new Map<string, ServerConfig>([
  ['s1', server('s1', 'alpha', '10.0.0.1')],
  ['s2', server('s2', 'beta', '10.0.0.2')],
])

const groups = groupForwards(
  [
    rule({ id: 'a', server_id: 's1', container_id: 'c1', container_name: 'web', running: true, tx_speed_bps: 1000 }),
    rule({ id: 'b', server_id: 's1', container_id: 'c1', container_name: 'web', local_port: 8081, enabled: false }),
    rule({ id: 'c', server_id: 's1', container_id: 'c2', container_name: 'db', local_port: 5432 }),
    rule({ id: 'd', server_id: 's2', container_id: 'c3', local_port: 6379, rx_speed_bps: 500 }),
  ],
  servers
)

describe('scopeKey / isSameScope', () => {
  it('keeps host and container namespaces apart', () => {
    expect(scopeKey(ALL_SCOPE)).toBe('all')
    expect(scopeKey({ kind: 'host', key: 'x' })).not.toBe(scopeKey({ kind: 'container', key: 'x' }))
    expect(isSameScope({ kind: 'host', key: 'x' }, { kind: 'host', key: 'x' })).toBe(true)
    expect(isSameScope({ kind: 'host', key: 'x' }, { kind: 'container', key: 'x' })).toBe(false)
  })
})

describe('containerLabel', () => {
  it('falls back to a short container id when unnamed', () => {
    const [, beta] = groups
    expect(containerLabel(beta.containers[0])).toBe('c3')
    expect(containerLabel(groups[0].containers[1])).toBe('web')
  })
})

describe('resolveScope', () => {
  it('returns every rule for the all scope', () => {
    const resolved = resolveScope(groups, ALL_SCOPE)
    expect(resolved.found).toBe(true)
    expect(resolved.title).toBeNull()
    expect(resolved.rules.map((item) => item.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('describes a host scope with its address', () => {
    const resolved = resolveScope(groups, { kind: 'host', key: 's1' })
    expect(resolved).toMatchObject({ found: true, title: 'alpha', subtitle: '10.0.0.1' })
    expect(resolved.rules).toHaveLength(3)
  })

  it('describes a container scope with its host as subtitle', () => {
    const resolved = resolveScope(groups, { kind: 'container', key: 's1/c1' })
    expect(resolved).toMatchObject({ found: true, title: 'web', subtitle: 'alpha' })
    expect(resolved.rules.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('reports missing scopes instead of throwing so the page can fall back', () => {
    expect(resolveScope(groups, { kind: 'host', key: 'gone' }).found).toBe(false)
    expect(resolveScope(groups, { kind: 'container', key: 's1/gone' }).found).toBe(false)
    expect(resolveScope([], ALL_SCOPE).rules).toEqual([])
  })
})

describe('summarizeRules', () => {
  it('counts states and adds up both directions', () => {
    expect(summarizeRules(resolveScope(groups, ALL_SCOPE).rules)).toEqual({
      total: 4,
      running: 1,
      enabled: 3,
      failed: 0,
      tx: 1000,
      rx: 500,
    })
  })

  it('treats a null speed as zero rather than NaN', () => {
    const summary = summarizeRules([rule({ id: 'x', server_id: 's1', container_id: 'c1', tx_speed_bps: null })])
    expect(summary.tx).toBe(0)
    expect(summary.rx).toBe(0)
  })

  it('counts a rule with a last error as failed', () => {
    const failing = rule({
      id: 'x',
      server_id: 's1',
      container_id: 'c1',
      last_error: { error: { code: 'e', kind: 'internal', params: {}, detail: null, retryable: true }, at_ms: 1 },
    })
    expect(summarizeRules([failing]).failed).toBe(1)
  })
})

describe('buildSections', () => {
  it('splits the all scope by host', () => {
    const sections = buildSections(groups, ALL_SCOPE)
    expect(sections.map((section) => section.label)).toEqual(['alpha', 'beta'])
    expect(sections[0].rules).toHaveLength(3)
  })

  it('splits a host scope by container and shows the id only for named containers', () => {
    const sections = buildSections(groups, { kind: 'host', key: 's1' })
    expect(sections.map((section) => section.label)).toEqual(['db', 'web'])
    expect(sections[1].sublabel).toBe('c1')
  })

  it('emits a single container section when one container is selected', () => {
    const sections = buildSections(groups, { kind: 'container', key: 's1/c1' })
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ label: 'web', sublabel: 'c1' })
    expect(sections[0].rules.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('omits the id sublabel for an unnamed container', () => {
    const sections = buildSections(groups, { kind: 'container', key: 's2/c3' })
    expect(sections[0]).toMatchObject({ label: 'c3', sublabel: null })
  })

  it('returns nothing when the scope is gone', () => {
    expect(buildSections(groups, { kind: 'host', key: 'gone' })).toEqual([])
    expect(buildSections(groups, { kind: 'container', key: 'gone' })).toEqual([])
  })
})

describe('ruleContainerLabel', () => {
  it('prefers the container name', () => {
    expect(ruleContainerLabel(rule({ id: 'x', server_id: 's1', container_id: 'abc', container_name: 'web' }))).toBe(
      'web'
    )
  })

  it('falls back to a 12-char id, matching the sidebar and section headers', () => {
    const long = 'a3f91c02be44ffffffff'
    expect(ruleContainerLabel(rule({ id: 'x', server_id: 's1', container_id: long }))).toBe('a3f91c02be44')
  })
})
