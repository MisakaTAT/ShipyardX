import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { ArrowLeftRight, Fingerprint, Server as ServerIcon, Stone } from 'lucide-react'
import { APP_PATHS } from '@/shared/lib/app-router'

export interface SiderNavItem {
  key: string
  title: string
  icon: ComponentType<LucideProps> | (() => ReactNode)
  path?: string
}

export const PRIMARY_NAV: SiderNavItem[] = [
  { key: 'workspace', title: '服务器列表', icon: ServerIcon, path: APP_PATHS.workspace },
  { key: 'port-forward', title: '端口转发', icon: ArrowLeftRight, path: APP_PATHS.portForward },
  { key: 'host-keys', title: '主机指纹', icon: Fingerprint, path: APP_PATHS.hostKeys },
  { key: 'store', title: '应用商店', icon: Stone, path: APP_PATHS.store },
]
