const STORAGE_KEY = 'shipyardx-server-os'

export type ServerOsMap = Record<string, string>

export function readServerOsMap(): ServerOsMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const result: ServerOsMap = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) result[id] = value
    }
    return result
  } catch {
    return {}
  }
}

function writeServerOsMap(next: ServerOsMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 存储不可用时静默降级，图标退回默认值 */
  }
}

export function saveServerOs(serverId: string, os: string) {
  const trimmed = os.trim()
  if (!trimmed) return
  const all = readServerOsMap()
  if (all[serverId] === trimmed) return
  all[serverId] = trimmed
  writeServerOsMap(all)
}

export function removeServerOs(serverId: string) {
  const all = readServerOsMap()
  if (!(serverId in all)) return
  delete all[serverId]
  writeServerOsMap(all)
}
