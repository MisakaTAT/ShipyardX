import type { DockerEngineInfo } from '@/types/app-bindings'

const STORAGE_KEY = 'shipyardx-server-snapshots'

export interface ServerSnapshot {
  ok: boolean
  at: number
  os?: string
  dockerVersion?: string
  error?: string
}

type SnapshotMap = Record<string, ServerSnapshot>

function isSnapshot(value: unknown): value is ServerSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.ok === 'boolean' && typeof record.at === 'number'
}

export function readSnapshots(): SnapshotMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const result: SnapshotMap = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (isSnapshot(value)) result[id] = value
    }
    return result
  } catch {
    return {}
  }
}

function writeSnapshots(next: SnapshotMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 存储不可用时静默降级，快照只是缓存 */
  }
}

export function saveSnapshot(serverId: string, snapshot: ServerSnapshot) {
  const all = readSnapshots()
  all[serverId] = snapshot
  writeSnapshots(all)
}

export function removeSnapshot(serverId: string) {
  const all = readSnapshots()
  if (!(serverId in all)) return
  delete all[serverId]
  writeSnapshots(all)
}

export function snapshotFromEngineInfo(info: DockerEngineInfo): ServerSnapshot {
  return {
    ok: true,
    at: Date.now(),
    os: info.os.trim() || undefined,
    dockerVersion: info.server_version.trim() || undefined,
  }
}

export function snapshotFromError(message: string): ServerSnapshot {
  return { ok: false, at: Date.now(), error: message }
}
