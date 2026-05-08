export const qk = {
  servers: () => ['servers'] as const,

  containers: (serverId: string) => ['docker', serverId, 'containers'] as const,
  containerInspect: (serverId: string, containerId: string) =>
    ['docker', serverId, 'containers', containerId, 'inspect'] as const,

  images: (serverId: string) => ['docker', serverId, 'images'] as const,
  imageInspect: (serverId: string, imageId: string) => ['docker', serverId, 'images', imageId, 'inspect'] as const,

  networks: (serverId: string) => ['docker', serverId, 'networks'] as const,
  networkInspect: (serverId: string, networkId: string) =>
    ['docker', serverId, 'networks', networkId, 'inspect'] as const,

  volumes: (serverId: string) => ['docker', serverId, 'volumes'] as const,
  volumeInspect: (serverId: string, name: string) => ['docker', serverId, 'volumes', name, 'inspect'] as const,

  dockerInfo: (serverId: string) => ['docker', serverId, 'info'] as const,
  dockerAccess: (serverId: string) => ['docker', serverId, 'access'] as const,
  dockerDaemon: (serverId: string) => ['docker', serverId, 'daemon'] as const,

  portForwards: () => ['port-forwards'] as const,

  localAddresses: () => ['local-addresses'] as const,

  apps: () => ['appstore', 'apps'] as const,
  appDetail: (appKey: string | null) => ['appstore', 'apps', appKey, 'detail'] as const,
  installedApps: (serverId?: string) => ['appstore', 'installed', serverId] as const,
} as const

export type QkKey =
  | ReturnType<typeof qk.servers>
  | ReturnType<typeof qk.containers>
  | ReturnType<typeof qk.images>
  | ReturnType<typeof qk.networks>
  | ReturnType<typeof qk.volumes>
  | ReturnType<typeof qk.dockerInfo>
  | ReturnType<typeof qk.dockerAccess>
  | ReturnType<typeof qk.dockerDaemon>
  | ReturnType<typeof qk.portForwards>
  | ReturnType<typeof qk.localAddresses>
  | ReturnType<typeof qk.apps>
  | ReturnType<typeof qk.appDetail>
  | ReturnType<typeof qk.installedApps>
