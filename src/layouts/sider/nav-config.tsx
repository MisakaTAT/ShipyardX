import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { ArrowLeftRight, Fingerprint, Server as ServerIcon, Stone } from 'lucide-react'
import { APP_PATHS } from '@/shared/lib/app-router'

export interface SiderNavItem {
  key: string
  titleKey: `ui.nav.${'servers' | 'portForward' | 'hostKeys' | 'appStore'}`
  icon: ComponentType<LucideProps> | (() => ReactNode)
  path?: string
}

export const PRIMARY_NAV: SiderNavItem[] = [
  { key: 'workspace', titleKey: 'ui.nav.servers', icon: ServerIcon, path: APP_PATHS.workspace },
  { key: 'port-forward', titleKey: 'ui.nav.portForward', icon: ArrowLeftRight, path: APP_PATHS.portForward },
  { key: 'host-keys', titleKey: 'ui.nav.hostKeys', icon: Fingerprint, path: APP_PATHS.hostKeys },
  { key: 'store', titleKey: 'ui.nav.appStore', icon: Stone, path: APP_PATHS.store },
]
