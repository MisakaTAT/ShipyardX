import type { PortForward, ServerConfig } from '@/types/app-bindings'

export interface ContainerGroup {
  key: string
  containerId: string
  containerName: string | null
  rules: PortForward[]
  runningCount: number
  enabledCount: number
}

export interface HostGroup {
  key: string
  serverId: string
  serverName: string
  serverHost: string | null
  containers: ContainerGroup[]
  ruleCount: number
  runningCount: number
  enabledCount: number
}

export function formatSpeed(bytesPerSecond: number | null): string {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytesPerSecond
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}/s`
}

export function collectRuleIds(group: HostGroup | ContainerGroup): string[] {
  if ('containers' in group) {
    return group.containers.flatMap((container) => container.rules.map((rule) => rule.id))
  }
  return group.rules.map((rule) => rule.id)
}

export function groupForwards(rules: PortForward[], serverById: Map<string, ServerConfig>): HostGroup[] {
  const hosts = new Map<string, HostGroup>()
  const containers = new Map<string, ContainerGroup>()

  for (const rule of rules) {
    let host = hosts.get(rule.server_id)
    if (!host) {
      const server = serverById.get(rule.server_id)
      host = {
        key: rule.server_id,
        serverId: rule.server_id,
        serverName: server?.name ?? rule.server_id,
        serverHost: server?.host ?? null,
        containers: [],
        ruleCount: 0,
        runningCount: 0,
        enabledCount: 0,
      }
      hosts.set(rule.server_id, host)
    }

    const containerKey = `${rule.server_id}/${rule.container_id}`
    let container = containers.get(containerKey)
    if (!container) {
      container = {
        key: containerKey,
        containerId: rule.container_id,
        containerName: rule.container_name,
        rules: [],
        runningCount: 0,
        enabledCount: 0,
      }
      containers.set(containerKey, container)
      host.containers.push(container)
    }

    container.rules.push(rule)
    host.ruleCount += 1
    if (rule.running) {
      container.runningCount += 1
      host.runningCount += 1
    }
    if (rule.enabled) {
      container.enabledCount += 1
      host.enabledCount += 1
    }
  }

  const byName = (a: string, b: string) => a.localeCompare(b)
  const result = [...hosts.values()].sort((a, b) => byName(a.serverName, b.serverName))
  for (const host of result) {
    host.containers.sort((a, b) => byName(a.containerName ?? a.containerId, b.containerName ?? b.containerId))
    for (const container of host.containers) {
      container.rules.sort((a, b) => a.local_port - b.local_port || byName(a.id, b.id))
    }
  }
  return result
}
