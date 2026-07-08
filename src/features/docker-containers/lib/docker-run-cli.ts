import type { RunContainer } from '@/types/app-bindings'

function splitShellArgs(input: string): string[] {
  const s = input.replace(/\\\r?\n/g, ' ').replace(/\\\n/g, ' ')
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && s[i + 1]) cur += s[++i]
      else cur += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (/\s/.test(c)) {
      if (cur.length) {
        out.push(cur)
        cur = ''
      }
      continue
    }
    if (c === '\\' && s[i + 1]) {
      cur += s[++i]
      continue
    }
    cur += c
  }
  if (cur.length) out.push(cur)
  return out
}

export type RunContainerValidationIssue = { message: string; path: (string | number)[] }

const RESTART_POLICIES = new Set(['no', 'always', 'unless-stopped', 'on-failure'])

function normalizeRestartPolicy(s: string): string {
  return s.trim().toLowerCase().replace(/_/g, '-')
}

function isValidIpv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const num = Number(part)
    return num >= 0 && num <= 255
  })
}

function isValidIpv6(value: string): boolean {
  if (!value || /\s/.test(value)) return false
  const parts = value.split('::')
  if (parts.length > 2) return false

  const left = parts[0] ? parts[0].split(':').filter(Boolean) : []
  const right = parts[1] ? parts[1].split(':').filter(Boolean) : []
  const all = [...left, ...right]

  if (all.length === 0 || all.length > 8) return false
  if (parts.length === 1 && all.length !== 8) return false

  return all.every((part) => /^[0-9a-fA-F]{1,4}$/.test(part))
}

export function getRunContainerValidationIssues(params: RunContainer): RunContainerValidationIssue[] {
  const issues: RunContainerValidationIssue[] = []

  if (!params.image?.trim()) {
    issues.push({ message: '镜像不能为空', path: ['image'] })
  }

  const nm = params.name?.trim() ?? ''
  if (nm) {
    if (nm.length > 255) {
      issues.push({ message: '名称过长（最多 255 字符）', path: ['name'] })
    } else if (!/^[\w.-]+$/.test(nm)) {
      issues.push({
        message: '名称仅允许字母、数字、下划线、连字符与点号',
        path: ['name'],
      })
    }
  }

  for (let i = 0; i < (params.env ?? []).length; i++) {
    const t = params.env?.[i]?.trim() ?? ''
    if (!t) continue
    const eq = t.indexOf('=')
    if (eq === -1) {
      issues.push({ message: `环境变量须为 KEY=value：${t}`, path: ['envEntries', i, 'key'] })
      break
    }
    if (!t.slice(0, eq).trim()) {
      issues.push({ message: `环境变量键名不能为空：${t}`, path: ['envEntries', i, 'key'] })
      break
    }
  }

  for (let i = 0; i < (params.labels ?? []).length; i++) {
    const t = params.labels?.[i]?.trim() ?? ''
    if (!t) continue
    const eq = t.indexOf('=')
    if (eq === -1) {
      issues.push({ message: `标签须为 KEY=value：${t}`, path: ['labelEntries', i, 'key'] })
      break
    }
    if (!t.slice(0, eq).trim()) {
      issues.push({ message: `标签键名不能为空：${t}`, path: ['labelEntries', i, 'key'] })
      break
    }
  }

  const ports = params.ports ?? []
  const seenHostPorts = new Map<string, number>()
  for (let i = 0; i < ports.length; i++) {
    const p = ports[i]
    const cp = p.container_port
    if (!cp || cp < 1 || cp > 65535) {
      issues.push({ message: '容器端口须在 1–65535', path: ['ports', i, 'containerPort'] })
    }
    const hp = p.host_port
    if (hp != null && hp !== 0 && (hp < 1 || hp > 65535)) {
      issues.push({ message: '主机端口须留空、0 或 1–65535', path: ['ports', i, 'hostPort'] })
    }
    const proto = (p.protocol || 'tcp').trim().toLowerCase()
    if (proto !== 'tcp' && proto !== 'udp') {
      issues.push({ message: '端口协议仅支持 tcp 或 udp', path: ['ports', i, 'protocol'] })
    }

    if (hp != null && hp !== 0) {
      const key = `${proto}:${hp}`
      const previousIndex = seenHostPorts.get(key)
      if (previousIndex != null) {
        issues.push({ message: `主机端口 ${hp} 已重复（${proto}）`, path: ['ports', i, 'hostPort'] })
      } else {
        seenHostPorts.set(key, i)
      }
    }
  }

  const vols = params.volumes ?? []
  for (let i = 0; i < vols.length; i++) {
    const v = vols[i]
    if (!v.host_path?.trim()) {
      issues.push({ message: '卷挂载主机路径不能为空', path: ['volumes', i, 'hostPath'] })
    }
    if (!v.container_path?.trim()) {
      issues.push({ message: '卷挂载容器路径不能为空', path: ['volumes', i, 'containerPath'] })
    }
  }

  const ip4 = params.ipv4_address?.trim() ?? ''
  const ip6 = params.ipv6_address?.trim() ?? ''
  const netNorm = (params.network?.trim() ?? '').toLowerCase()
  const isUserDefinedNetwork = netNorm.length > 0 && !['bridge', 'host', 'none', 'default'].includes(netNorm)
  if (ip4 && !isValidIpv4(ip4)) {
    issues.push({ message: 'IPv4 地址格式不正确', path: ['ipv4Address'] })
  }
  if (ip6 && !isValidIpv6(ip6)) {
    issues.push({ message: 'IPv6 地址格式不正确', path: ['ipv6Address'] })
  }
  if ((ip4 || ip6) && !isUserDefinedNetwork) {
    issues.push({
      message: '固定 IPv4/IPv6 仅适用于用户自定义网络，请在网络中选择自建网络（非 bridge / host / none）',
      path: ['network'],
    })
  }

  const rp = normalizeRestartPolicy(params.restart_policy || 'no')
  if (!RESTART_POLICIES.has(rp)) {
    issues.push({
      message: `不支持的重启策略：${params.restart_policy}（可选：no、always、unless-stopped、on-failure）`,
      path: ['restartPolicy'],
    })
  }

  if (rp === 'on-failure') {
    const n = params.restart_max_retry
    if (n != null && (!Number.isFinite(n) || n < 0)) {
      issues.push({ message: '最大重试次数须为不小于 0 的整数', path: ['restartMaxRetry'] })
    }
  }

  if (params.cpu_shares != null && params.cpu_shares < 0) {
    issues.push({ message: 'CPU 权重不能为负', path: ['cpuShares'] })
  }
  if (params.cpu_quota_cores != null && params.cpu_quota_cores < 0) {
    issues.push({ message: 'CPU 上限（核）不能为负', path: ['cpuQuotaCores'] })
  }
  if (params.memory_mb != null && params.memory_mb < 0) {
    issues.push({ message: '内存上限不能为负', path: ['memoryMb'] })
  }

  return issues
}

export function buildRunParamsFromForm(args: {
  image: string
  name: string
  envEntries: { key: string; value: string }[]
  labelEntries: { key: string; value: string }[]
  ports: { containerPort: number; hostPort: number | null; protocol: string }[]
  volumes: { hostPath: string; containerPath: string; readOnly: boolean }[]
  restartPolicy: string
  restartMaxRetry: string
  publishAllPorts: boolean
  network: string
  ipv4Address: string
  ipv6Address: string
  commandMode: 'raw' | 'args'
  commandText: string
  commandArgs: { value: string }[]
  entrypointMode: 'raw' | 'args'
  entrypointText: string
  entrypointArgs: { value: string }[]
  autoRemove: boolean
  privileged: boolean
  tty: boolean
  openStdin: boolean
  cpuShares: string
  cpuQuotaCores: string
  memoryMb: string
}): RunContainer {
  const env = args.envEntries
    .map(({ key, value }) => ({ key: key.trim(), value }))
    .filter(({ key, value }) => key || value)
    .map(({ key, value }) => `${key}=${value}`)
  const labels = args.labelEntries
    .map(({ key, value }) => ({ key: key.trim(), value }))
    .filter(({ key, value }) => key || value)
    .map(({ key, value }) => `${key}=${value}`)
  const command =
    args.commandMode === 'raw'
      ? splitShellArgs(args.commandText.trim()).filter(Boolean)
      : args.commandArgs.map(({ value }) => value.trim()).filter(Boolean)
  const entrypoint =
    args.entrypointMode === 'raw'
      ? splitShellArgs(args.entrypointText.trim()).filter(Boolean)
      : args.entrypointArgs.map(({ value }) => value.trim()).filter(Boolean)
  const cpuShares = Math.max(0, parseInt(args.cpuShares, 10) || 0)
  const cpuQuota = Math.max(0, parseFloat(args.cpuQuotaCores) || 0)
  const memMb = Math.max(0, parseInt(args.memoryMb, 10) || 0)

  return {
    image: args.image.trim(),
    name: args.name.trim() || null,
    env,
    ports: args.ports.map((p) => ({
      container_port: p.containerPort,
      host_port: p.hostPort == null || p.hostPort === 0 ? null : p.hostPort,
      protocol: p.protocol || 'tcp',
    })),
    volumes: args.volumes.map((v) => ({
      host_path: v.hostPath.trim(),
      container_path: v.containerPath.trim(),
      read_only: Boolean(v.readOnly),
    })),
    restart_policy: args.restartPolicy,
    restart_max_retry:
      args.restartPolicy === 'on-failure' ? Math.max(0, parseInt(args.restartMaxRetry, 10) || 0) : null,
    publish_all_ports: args.publishAllPorts,
    network: args.network.trim() || 'bridge',
    ipv4_address: args.ipv4Address.trim(),
    ipv6_address: args.ipv6Address.trim(),
    command,
    entrypoint,
    labels,
    auto_remove: args.autoRemove,
    privileged: args.privileged,
    tty: args.tty,
    open_stdin: args.openStdin,
    cpu_shares: cpuShares,
    cpu_quota_cores: cpuQuota,
    memory_mb: memMb,
  }
}
