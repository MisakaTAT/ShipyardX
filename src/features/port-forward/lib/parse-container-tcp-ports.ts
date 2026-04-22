export type ContainerPortOption = {
  container_port: number
  label: string
}

export function parseContainerTcpPortOptions(ports: string): ContainerPortOption[] {
  if (!ports) return []
  const rawItems = ports
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const out: ContainerPortOption[] = []
  const seen = new Set<number>()

  for (const raw of rawItems) {
    const m = raw.match(/^(.+):(\d+)->(\d+)\/([a-zA-Z0-9]+)$/)
    if (!m) continue
    const containerPort = Number(m[3])
    const protocol = String(m[4]).toLowerCase()
    if (!Number.isFinite(containerPort)) continue
    if (protocol !== 'tcp') continue
    if (containerPort < 1 || containerPort > 65535) continue
    if (seen.has(containerPort)) continue
    seen.add(containerPort)
    out.push({
      container_port: containerPort,
      label: `${containerPort}/TCP`,
    })
  }

  out.sort((a, b) => a.container_port - b.container_port)
  return out
}
