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

  for (const line of params.env ?? []) {
    const t = line.trim()
    if (!t) continue
    const eq = t.indexOf('=')
    if (eq === -1) {
      issues.push({ message: `环境变量须为 KEY=value：${t}`, path: ['envText'] })
      break
    }
    if (!t.slice(0, eq).trim()) {
      issues.push({ message: `环境变量键名不能为空：${t}`, path: ['envText'] })
      break
    }
  }

  for (const line of params.labels ?? []) {
    const t = line.trim()
    if (!t) continue
    const eq = t.indexOf('=')
    if (eq === -1) {
      issues.push({ message: `标签须为 KEY=value：${t}`, path: ['labelText'] })
      break
    }
    if (!t.slice(0, eq).trim()) {
      issues.push({ message: `标签键名不能为空：${t}`, path: ['labelText'] })
      break
    }
  }

  const ports = params.ports ?? []
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
  envLines: string[]
  labelLines: string[]
  ports: { containerPort: number; hostPort: number | null; protocol: string }[]
  volumes: { hostPath: string; containerPath: string; readOnly: boolean }[]
  restartPolicy: string
  restartMaxRetry: string
  publishAllPorts: boolean
  network: string
  ipv4Address: string
  ipv6Address: string
  commandLines: string[]
  entrypointLine: string
  autoRemove: boolean
  privileged: boolean
  tty: boolean
  openStdin: boolean
  cpuShares: string
  cpuQuotaCores: string
  memoryMb: string
}): RunContainer {
  const env = args.envLines.map((s) => s.trim()).filter(Boolean)
  const labels = args.labelLines.map((s) => s.trim()).filter(Boolean)
  const command = args.commandLines.map((s) => s.trim()).filter(Boolean)
  const entrypoint = splitShellArgs(args.entrypointLine.trim()).filter(Boolean)
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
