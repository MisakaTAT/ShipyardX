import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { ArrowLeftRight, Server as ServerIcon, Stone } from 'lucide-react'
import { APP_PATHS } from '@/shared/lib/app-router'

export interface SiderNavItem {
  key: string
  title: string
  icon: ComponentType<LucideProps> | (() => ReactNode)
  /** 内部路径；不填表示外部/功能按钮（需由调用方传入 onClick） */
  path?: string
}

/** 侧边栏主路由导航项 */
export const PRIMARY_NAV: SiderNavItem[] = [
  { key: 'workspace', title: '服务器列表', icon: ServerIcon, path: APP_PATHS.workspace },
  { key: 'port-forward', title: '端口转发', icon: ArrowLeftRight, path: APP_PATHS.portForward },
  { key: 'store', title: '应用商店', icon: Stone, path: APP_PATHS.store },
]
