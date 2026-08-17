import { describe, expect, it } from 'vitest'
import type { PortForward, ServerConfig } from '@/types/app-bindings'
import { collectRuleIds, formatSpeed, groupForwards } from '@/features/port-forward/model/group-forwards'

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
  ['s1', server('s1', 'beta', '10.0.0.2')],
  ['s2', server('s2', 'alpha', '10.0.0.1')],
])

describe('formatSpeed', () => {
  it('picks a unit and keeps one decimal below 100', () => {
    expect(formatSpeed(0)).toBe('0 B/s')
    expect(formatSpeed(512)).toBe('512 B/s')
    expect(formatSpeed(1500)).toBe('1.5 KB/s')
    expect(formatSpeed(167_123)).toBe('167 KB/s')
    expect(formatSpeed(2_250_000)).toBe('2.3 MB/s')
  })

  it('guards against missing and non-finite input', () => {
    expect(formatSpeed(null)).toBe('0 B/s')
    expect(formatSpeed(Number.NaN)).toBe('0 B/s')
    expect(formatSpeed(-1)).toBe('0 B/s')
  })

  it('never runs past the largest unit', () => {
    expect(formatSpeed(9e18)).toMatch(/TB\/s$/)
  })
})

describe('groupForwards', () => {
  it('nests rules under host and container', () => {
    const groups = groupForwards(
      [
        rule({ id: 'a', server_id: 's1', container_id: 'c1', container_name: 'web' }),
        rule({ id: 'b', server_id: 's1', container_id: 'c2', container_name: 'db', local_port: 5432 }),
        rule({ id: 'c', server_id: 's2', container_id: 'c3', container_name: 'cache' }),
      ],
      servers
    )

    expect(groups.map((g) => g.serverName)).toEqual(['alpha', 'beta'])
    const beta = groups.find((g) => g.serverId === 's1')!
    expect(beta.containers.map((c) => c.containerName)).toEqual(['db', 'web'])
    expect(beta.ruleCount).toBe(2)
  })

  it('keeps ordering stable so live updates do not reshuffle rows', () => {
    const groups = groupForwards(
      [
        rule({ id: 'a', server_id: 's1', container_id: 'c1', local_port: 9000 }),
        rule({ id: 'b', server_id: 's1', container_id: 'c1', local_port: 3000 }),
        rule({ id: 'c', server_id: 's1', container_id: 'c1', local_port: 5000 }),
      ],
      servers
    )
    expect(groups[0].containers[0].rules.map((r) => r.local_port)).toEqual([3000, 5000, 9000])
  })

  it('breaks local-port ties by id rather than leaving order to input', () => {
    const groups = groupForwards(
      [
        rule({ id: 'z', server_id: 's1', container_id: 'c1', local_port: 0 }),
        rule({ id: 'a', server_id: 's1', container_id: 'c1', local_port: 0 }),
      ],
      servers
    )
    expect(groups[0].containers[0].rules.map((r) => r.id)).toEqual(['a', 'z'])
  })

  it('counts running and enabled rules at both levels', () => {
    const groups = groupForwards(
      [
        rule({ id: 'a', server_id: 's1', container_id: 'c1', running: true }),
        rule({ id: 'b', server_id: 's1', container_id: 'c1', enabled: false, local_port: 8081 }),
        rule({ id: 'c', server_id: 's1', container_id: 'c2', local_port: 8082 }),
      ],
      servers
    )

    const host = groups[0]
    expect(host.runningCount).toBe(1)
    expect(host.enabledCount).toBe(2)
    expect(host.ruleCount).toBe(3)
    expect(host.containers[0].enabledCount).toBe(1)
    expect(host.containers[0].runningCount).toBe(1)
  })

  it('falls back to the server id when the server is unknown', () => {
    const groups = groupForwards([rule({ id: 'a', server_id: 'gone', container_id: 'c1' })], servers)
    expect(groups[0].serverName).toBe('gone')
    expect(groups[0].serverHost).toBeNull()
  })

  it('keeps same-named containers on different hosts apart', () => {
    const groups = groupForwards(
      [
        rule({ id: 'a', server_id: 's1', container_id: 'shared', container_name: 'web' }),
        rule({ id: 'b', server_id: 's2', container_id: 'shared', container_name: 'web' }),
      ],
      servers
    )
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.containers[0].key)).toEqual(['s2/shared', 's1/shared'])
  })

  it('returns nothing for an empty rule set', () => {
    expect(groupForwards([], servers)).toEqual([])
  })
})

describe('collectRuleIds', () => {
  it('flattens host and container scopes', () => {
    const [host] = groupForwards(
      [
        rule({ id: 'a', server_id: 's1', container_id: 'c1' }),
        rule({ id: 'b', server_id: 's1', container_id: 'c2', local_port: 8081 }),
      ],
      servers
    )
    expect(collectRuleIds(host).sort()).toEqual(['a', 'b'])
    expect(collectRuleIds(host.containers[0])).toHaveLength(1)
  })
})
