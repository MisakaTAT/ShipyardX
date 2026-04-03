import type { RunContainer } from '@/types/app-bindings'

export function splitShellArgs(input: string): string[] {
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

function expandRunTokens(tokens: string[]): string[] {
  const res: string[] = []
  for (const t of tokens) {
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      if (eq !== -1) {
        res.push(t.slice(0, eq), t.slice(eq + 1))
      } else {
        res.push(t)
      }
      continue
    }
    if (t.startsWith('-p') && t.length > 2 && t[2] !== '-') {
      res.push('-p', t.slice(2))
      continue
    }
    if (t.startsWith('-e') && t.length > 2 && t[2] !== '-') {
      res.push('-e', t.slice(2))
      continue
    }
    if (t.startsWith('-v') && t.length > 2 && t[2] !== '-') {
      res.push('-v', t.slice(2))
      continue
    }
    res.push(t)
  }
  return res
}

function parsePublish(spec: string): { host_port: number | null; container_port: number; protocol: string } | null {
  const m = spec.match(/\/(tcp|udp)$/i)
  const protocol = m ? m[1].toLowerCase() : 'tcp'
  const core = m ? spec.slice(0, -m[0].length) : spec
  const parts = core.split(':').filter((p) => p.length > 0)
  if (parts.length === 1) {
    const p = parseInt(parts[0], 10)
    if (!Number.isFinite(p) || p < 1 || p > 65535) return null
    return { host_port: null, container_port: p, protocol }
  }
  if (parts.length === 2) {
    const a = parseInt(parts[0], 10)
    const b = parseInt(parts[1], 10)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    if (a < 1 || a > 65535 || b < 1 || b > 65535) return null
    return { host_port: a, container_port: b, protocol }
  }
  if (parts.length === 3) {
    const hostPort = parseInt(parts[1], 10)
    const containerPort = parseInt(parts[2], 10)
    if (!Number.isFinite(hostPort) || !Number.isFinite(containerPort)) return null
    if (hostPort < 1 || hostPort > 65535 || containerPort < 1 || containerPort > 65535) return null
    return { host_port: hostPort, container_port: containerPort, protocol }
  }
  return null
}

function parseVolume(spec: string): { host_path: string; container_path: string; read_only: boolean } | null {
  const ro = /:ro$/i.test(spec)
  const core = ro ? spec.slice(0, -3) : spec
  const idx = core.indexOf(':')
  if (idx <= 0 || idx >= core.length - 1) return null
  return {
    host_path: core.slice(0, idx),
    container_path: core.slice(idx + 1),
    read_only: ro,
  }
}

function parseRestart(
  value: string,
): { restart_policy: string; restart_max_retry: number | null } {
  const v = value.trim().toLowerCase()
  if (v.startsWith('on-failure')) {
    const colon = v.indexOf(':')
    if (colon !== -1) {
      const n = parseInt(v.slice(colon + 1), 10)
      return {
        restart_policy: 'on-failure',
        restart_max_retry: Number.isFinite(n) ? Math.max(0, n) : 0,
      }
    }
    return { restart_policy: 'on-failure', restart_max_retry: 0 }
  }
  if (v === 'unless-stopped' || v === 'always' || v === 'no') {
    return { restart_policy: v, restart_max_retry: null }
  }
  return { restart_policy: 'no', restart_max_retry: null }
}

export type ParseContainerRunResult = { ok: true; params: RunContainer } | { ok: false; error: string }

/**
 * 解析 `docker run ...` 为 RunContainer（与后端 run_container 一致）。
 * 不支持的 flag 会忽略；镜像后的参数视为命令，不写入表单。
 */
export function parseContainerRun(input: string): ParseContainerRunResult {
  const raw = input.trim()
  if (!raw) return { ok: false, error: '命令为空' }

  let s = raw.replace(/\\\r?\n/g, ' ').replace(/\\\n/g, ' ')
  const lead = s.match(/^\s*docker\s+run\s+/i)
  if (lead) s = s.slice(lead[0].length)

  const tokens = expandRunTokens(splitShellArgs(s))
  const env: string[] = []
  const ports: RunContainer['ports'] = []
  const volumes: RunContainer['volumes'] = []
  let name: string | null = null
  let restart_policy = 'no'
  let restart_max_retry: number | null = null

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t === '-d' || t === '--detach' || t === '-i' || t === '--interactive' || t === '-t' || t === '--tty') {
      i++
      continue
    }
    if (t === '--name') {
      const v = tokens[++i]
      if (!v) return { ok: false, error: '--name 缺少值' }
      name = v
      i++
      continue
    }
    if (t === '--restart') {
      const v = tokens[++i]
      if (!v) return { ok: false, error: '--restart 缺少值' }
      const r = parseRestart(v)
      restart_policy = r.restart_policy
      restart_max_retry = r.restart_max_retry
      i++
      continue
    }
    if (t === '-p' || t === '--publish') {
      const v = tokens[++i]
      if (!v) return { ok: false, error: `${t} 缺少端口映射` }
      const p = parsePublish(v)
      if (!p) return { ok: false, error: `无法解析端口映射: ${v}` }
      ports.push({
        container_port: p.container_port,
        host_port: p.host_port,
        protocol: p.protocol,
      })
      i++
      continue
    }
    if (t === '-P' || t === '--publish-all') {
      i++
      continue
    }
    if (t === '-e' || t === '--env') {
      const v = tokens[++i]
      if (!v) return { ok: false, error: `${t} 缺少环境变量` }
      env.push(v.includes('=') ? v : `${v}=`)
      i++
      continue
    }
    if (t === '-v' || t === '--volume') {
      const v = tokens[++i]
      if (!v) return { ok: false, error: `${t} 缺少卷映射` }
      const vol = parseVolume(v)
      if (!vol) return { ok: false, error: `无法解析卷映射: ${v}` }
      volumes.push(vol)
      i++
      continue
    }
    if (t.startsWith('-')) {
      i++
      continue
    }

    const image = t
    if (!image) return { ok: false, error: '未找到镜像名（请在命令末尾指定镜像）' }

    for (const line of env) {
      if (!line.includes('=')) return { ok: false, error: `环境变量须含 =：${line}` }
    }

    return {
      ok: true,
      params: {
        image,
        name: name?.trim() || null,
        env,
        ports,
        volumes,
        restart_policy,
        restart_max_retry: restart_policy === 'on-failure' ? restart_max_retry ?? 0 : null,
      },
    }
  }

  return { ok: false, error: '未找到镜像名（请在命令末尾指定镜像）' }
}

function shellQuote(s: string): string {
  if (s.length === 0) return "''"
  if (/^[\w@%+=:,./-]+$/.test(s)) return s
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export function formatContainerRun(params: RunContainer): string {
  const body: string[] = ['docker run -d']
  if (params.name?.trim()) {
    body.push(`--name ${shellQuote(params.name.trim())}`)
  }
  const rp = params.restart_policy || 'no'
  if (rp === 'on-failure') {
    const n = params.restart_max_retry ?? 0
    body.push(`--restart ${n > 0 ? `on-failure:${n}` : 'on-failure'}`)
  } else if (rp && rp !== 'no') {
    body.push(`--restart ${rp}`)
  }

  for (const e of params.env ?? []) {
    if (e.trim()) body.push(`-e ${shellQuote(e.trim())}`)
  }

  for (const p of params.ports ?? []) {
    const proto = (p.protocol || 'tcp').toLowerCase()
    const suffix = proto === 'udp' ? '/udp' : ''
    let spec: string
    if (p.host_port == null || p.host_port === 0) {
      spec = `${p.container_port}${suffix}`
    } else {
      spec = `${p.host_port}:${p.container_port}${suffix}`
    }
    body.push(`-p ${spec}`)
  }

  for (const v of params.volumes ?? []) {
    const hp = v.host_path.trim()
    const cp = v.container_path.trim()
    if (!hp || !cp) continue
    const tail = v.read_only ? ':ro' : ''
    body.push(`-v ${shellQuote(`${hp}:${cp}${tail}`)}`)
  }

  body.push(shellQuote(params.image.trim()))

  return body
    .map((line, i) => {
      if (i === body.length - 1) return `  ${line}`
      if (i === 0) return `${line} \\`
      return `  ${line} \\`
    })
    .join('\n')
}

export function validateRunParams(params: RunContainer): string | null {
  if (!params.image.trim()) return '镜像不能为空'
  for (const line of params.env ?? []) {
    if (!line.includes('=')) return `环境变量须为 KEY=value：${line}`
  }
  for (const p of params.ports ?? []) {
    if (!p.container_port || p.container_port < 1 || p.container_port > 65535) return '容器端口须在 1–65535'
    const hp = p.host_port
    if (hp != null && hp !== 0 && (hp < 1 || hp > 65535)) return '主机端口须为空、0 或 1–65535'
  }
  for (const v of params.volumes ?? []) {
    if (!v.host_path.trim() || !v.container_path.trim()) return '卷挂载路径不能为空'
  }
  return null
}

export function buildRunParamsFromForm(args: {
  image: string
  name: string
  envLines: string[]
  ports: { containerPort: number; hostPort: number | null; protocol: string }[]
  volumes: { hostPath: string; containerPath: string; readOnly: boolean }[]
  restartPolicy: string
  restartMaxRetry: string
}): RunContainer {
  const env = args.envLines.map((s) => s.trim()).filter(Boolean)
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
  }
}

export function paramsToFormState(params: RunContainer): {
  image: string
  name: string
  envText: string
  ports: { containerPort: number; hostPort: number | null; protocol: string }[]
  volumes: { hostPath: string; containerPath: string; readOnly: boolean }[]
  restartPolicy: string
  restartMaxRetry: string
} {
  return {
    image: params.image.trim(),
    name: params.name?.trim() ?? '',
    envText: (params.env ?? []).join('\n'),
    ports: (params.ports ?? []).map((p) => ({
      containerPort: p.container_port,
      hostPort: p.host_port ?? null,
      protocol: p.protocol || 'tcp',
    })),
    volumes: (params.volumes ?? []).map((v) => ({
      hostPath: v.host_path,
      containerPath: v.container_path,
      readOnly: Boolean(v.read_only),
    })),
    restartPolicy: params.restart_policy,
    restartMaxRetry: String(params.restart_max_retry ?? 0),
  }
}
