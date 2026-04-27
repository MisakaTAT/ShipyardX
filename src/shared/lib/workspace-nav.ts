export type WorkspaceNavigateTarget = {
  tab: 'overview' | 'containers' | 'images' | 'networks' | 'volumes' | 'docker' | 'events' | 'terminal'
  serverId?: string
  containerSearch?: string
}

const EVENT_NAME = 'workspace:navigate'

function containerSearchKey(serverId: string) {
  return `workspace:containersSearch:${serverId}`
}

export function setNextContainerSearch(serverId: string, search: string) {
  try {
    sessionStorage.setItem(containerSearchKey(serverId), search)
  } catch {
    /* ignore */
  }
}

export function consumeNextContainerSearch(serverId: string): string | null {
  try {
    const key = containerSearchKey(serverId)
    const v = sessionStorage.getItem(key)
    if (v) sessionStorage.removeItem(key)
    return v
  } catch {
    return null
  }
}

export function navigateWorkspace(target: WorkspaceNavigateTarget) {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: target }))
  } catch {
    /* ignore */
  }
}

export function onWorkspaceNavigate(cb: (t: WorkspaceNavigateTarget) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<WorkspaceNavigateTarget>).detail)
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}
