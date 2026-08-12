import { useMemo } from 'react'
import { useLocation } from 'wouter'
import {
  ArrowLeftRight,
  Fingerprint,
  Moon,
  Package,
  Plus,
  Server as ServerIcon,
  Settings,
  Stone,
  Sun,
} from 'lucide-react'
import { APP_PATHS } from '@/shared/lib/app-router'
import { runThemeTransition, useIsLightMode, useTheme } from '@/app/theme'
import { useServers } from '@/features/servers/api/use-servers'
import { usePortForwards } from '@/features/port-forward/api/use-port-forwards'
import { useKnownHosts } from '@/features/host-keys/api/use-host-keys'
import { useAllApps } from '@/features/appstore/api/use-appstore'
import { useSelectedAppSource } from '@/features/appstore/model/source-selection'
import { useAppSettings } from '@/app/settings-store'
import { withQuery, type PaletteItem } from '@/features/command-palette/model/palette-item'

export function usePaletteItems(enabled: boolean): PaletteItem[] {
  const [, navigate] = useLocation()
  const { setTheme } = useTheme()
  const light = useIsLightMode()

  const { data: servers = [] } = useServers(enabled)
  const { data: forwards = [] } = usePortForwards(enabled)
  const { data: hostKeys = [] } = useKnownHosts(enabled)

  const { settings: appSettings } = useAppSettings()
  const enabledSources = useMemo(
    () => appSettings.appstore.sources.filter((source) => source.enabled && source.repoUrl.trim()),
    [appSettings.appstore.sources]
  )

  const [, setSourceId] = useSelectedAppSource(enabledSources)
  const appsBySource = useAllApps(enabledSources, enabled)

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers])

  return useMemo(() => {
    const items: PaletteItem[] = []

    for (const server of servers) {
      items.push({
        id: `server:${server.id}`,
        group: 'server',
        title: server.name,
        subtitle: `${server.username}@${server.host}:${server.port}`,
        icon: ServerIcon,
        keywords: server.host,
        run: () => navigate(withQuery(APP_PATHS.workspace, server.name)),
      })
    }

    for (const forward of forwards) {
      const server = serverById.get(forward.server_id)
      const forwardTitle = forward.container_name ?? forward.container_id.slice(0, 12)
      items.push({
        id: `forward:${forward.id}`,
        group: 'forward',
        title: forwardTitle,
        subtitle: `${server?.name ?? forward.server_id} · ${forward.bind_address}:${forward.local_port} → ${forward.remote_host}:${forward.remote_port}`,
        icon: ArrowLeftRight,
        keywords: `${forward.container_id} ${forward.local_port} ${forward.remote_port}`,
        run: () => navigate(withQuery(APP_PATHS.portForward, forwardTitle)),
      })
    }

    for (const entry of hostKeys) {
      items.push({
        id: `hostKey:${entry.host}:${entry.port}`,
        group: 'hostKey',
        title: `${entry.host}:${entry.port}`,
        subtitle: entry.fingerprint,
        icon: Fingerprint,
        run: () => navigate(withQuery(APP_PATHS.hostKeys, `${entry.host}:${entry.port}`)),
      })
    }

    // 多个源可能有同名应用，id 和副标题都带上源，否则分不清也会 key 冲突
    const multiSource = appsBySource.length > 1
    for (const { sourceId, sourceName, apps } of appsBySource) {
      for (const app of apps) {
        items.push({
          id: `app:${sourceId}:${app.key}`,
          group: 'app',
          title: app.name,
          subtitle: multiSource ? `${sourceName} · ${app.short_desc_zh}` : app.short_desc_zh,
          icon: Package,
          keywords: `${app.key} ${sourceName} ${app.tags.join(' ')}`,
          // 先切源再跳转，否则落到应用商店页看到的还是原来那个源
          run: () => {
            setSourceId(sourceId)
            navigate(withQuery(APP_PATHS.store, app.name))
          },
        })
      }
    }

    items.push(
      {
        id: 'command:add-server',
        group: 'command',
        title: '添加服务器',
        icon: Plus,
        keywords: 'server add new 新建',
        run: () => navigate(`${APP_PATHS.workspace}?new=1`),
      },
      {
        id: 'command:add-forward',
        group: 'command',
        title: '创建转发规则',
        icon: Plus,
        keywords: 'port forward add new 新建',
        run: () => navigate(`${APP_PATHS.portForward}?new=1`),
      },
      {
        id: 'command:add-host-key',
        group: 'command',
        title: '添加指纹',
        icon: Plus,
        keywords: 'host key fingerprint add new 新建',
        run: () => navigate(`${APP_PATHS.hostKeys}?new=1`),
      },
      {
        id: 'command:open-store',
        group: 'command',
        title: '打开应用商店',
        icon: Stone,
        keywords: 'appstore apps',
        run: () => navigate(APP_PATHS.store),
      },
      {
        id: 'command:open-settings',
        group: 'command',
        title: '打开设置',
        icon: Settings,
        keywords: 'settings preferences 偏好',
        run: () => navigate(APP_PATHS.settings),
      },
      {
        id: 'command:toggle-theme',
        group: 'command',
        title: light ? '切换到深色主题' : '切换到浅色主题',
        icon: light ? Moon : Sun,
        keywords: 'theme dark light 主题',
        run: () => runThemeTransition(null, () => setTheme(light ? 'dark' : 'light')),
      }
    )

    return items
  }, [servers, forwards, hostKeys, appsBySource, serverById, navigate, setSourceId, light, setTheme])
}
