import type { PortForward } from '@/types/app-bindings'
import type { ContainerGroup, HostGroup } from '@/features/port-forward/model/group-forwards'

export type ForwardScope = { kind: 'all' } | { kind: 'host'; key: string } | { kind: 'container'; key: string }

export const ALL_SCOPE: ForwardScope = { kind: 'all' }

export function scopeKey(scope: ForwardScope): string {
  return scope.kind === 'all' ? 'all' : `${scope.kind}:${scope.key}`
}

export function isSameScope(a: ForwardScope, b: ForwardScope): boolean {
  return scopeKey(a) === scopeKey(b)
}

export function containerLabel(container: ContainerGroup): string {
  return container.containerName ?? container.containerId.slice(0, 12)
}

function hostRules(host: HostGroup): PortForward[] {
  return host.containers.flatMap((container) => container.rules)
}

export interface ResolvedScope {
  found: boolean
  title: string | null
  subtitle: string | null
  rules: PortForward[]
}

export function resolveScope(groups: HostGroup[], scope: ForwardScope): ResolvedScope {
  if (scope.kind === 'all') {
    return { found: true, title: null, subtitle: null, rules: groups.flatMap(hostRules) }
  }

  if (scope.kind === 'host') {
    const host = groups.find((item) => item.key === scope.key)
    if (!host) return { found: false, title: null, subtitle: null, rules: [] }
    return { found: true, title: host.serverName, subtitle: host.serverHost, rules: hostRules(host) }
  }

  for (const host of groups) {
    const container = host.containers.find((item) => item.key === scope.key)
    if (container) {
      return { found: true, title: containerLabel(container), subtitle: host.serverName, rules: container.rules }
    }
  }
  return { found: false, title: null, subtitle: null, rules: [] }
}

export interface ScopeSummary {
  total: number
  running: number
  enabled: number
  failed: number
  tx: number
  rx: number
}

export function summarizeRules(rules: PortForward[]): ScopeSummary {
  const summary: ScopeSummary = { total: rules.length, running: 0, enabled: 0, failed: 0, tx: 0, rx: 0 }
  for (const rule of rules) {
    if (rule.running) summary.running += 1
    if (rule.enabled) summary.enabled += 1
    if (rule.last_error) summary.failed += 1
    summary.tx += rule.tx_speed_bps ?? 0
    summary.rx += rule.rx_speed_bps ?? 0
  }
  return summary
}

export interface RuleSection {
  key: string
  label: string
  sublabel: string | null
  rules: PortForward[]
}

function containerSection(container: ContainerGroup): RuleSection {
  return {
    key: container.key,
    label: containerLabel(container),
    sublabel: container.containerName ? container.containerId.slice(0, 12) : null,
    rules: container.rules,
  }
}

export function buildSections(groups: HostGroup[], scope: ForwardScope): RuleSection[] {
  if (scope.kind === 'all') {
    return groups.map((host) => ({
      key: host.key,
      label: host.serverName,
      sublabel: host.serverHost,
      rules: hostRules(host),
    }))
  }

  if (scope.kind === 'host') {
    const host = groups.find((item) => item.key === scope.key)
    return host ? host.containers.map(containerSection) : []
  }

  for (const host of groups) {
    const container = host.containers.find((item) => item.key === scope.key)
    if (container) return [containerSection(container)]
  }
  return []
}
