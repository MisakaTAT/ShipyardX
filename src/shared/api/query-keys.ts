export const qk = {
  servers: () => ['servers'] as const,

  containers: (serverId: string) => ['docker', serverId, 'containers'] as const,
  containerInspect: (serverId: string, containerId: string) =>
    ['docker', serverId, 'containers', containerId, 'inspect'] as const,
  containerStats: (serverId: string, containerId: string) =>
    ['docker', serverId, 'containers', containerId, 'stats'] as const,

  images: (serverId: string) => ['docker', serverId, 'images'] as const,
  imageInspect: (serverId: string, imageId: string) => ['docker', serverId, 'images', imageId, 'inspect'] as const,
  imageHistory: (serverId: string, imageId: string) => ['docker', serverId, 'images', imageId, 'history'] as const,

  networks: (serverId: string) => ['docker', serverId, 'networks'] as const,
  networkInspect: (serverId: string, networkId: string) =>
    ['docker', serverId, 'networks', networkId, 'inspect'] as const,

  volumes: (serverId: string) => ['docker', serverId, 'volumes'] as const,
  volumeInspect: (serverId: string, name: string) => ['docker', serverId, 'volumes', name, 'inspect'] as const,

  dockerInfo: (serverId: string) => ['docker', serverId, 'info'] as const,
  serverConnection: (serverId: string) => ['server', serverId, 'connection'] as const,
  dockerAccess: (serverId: string) => ['docker', serverId, 'access'] as const,
  dockerDaemon: (serverId: string) => ['docker', serverId, 'daemon'] as const,

  portForwards: () => ['port-forwards'] as const,

  knownHosts: () => ['known-hosts'] as const,

  localAddresses: () => ['local-addresses'] as const,

  appstoreSettings: () => ['appstore', 'settings'] as const,
  appstoreCacheInfo: () => ['appstore', 'cache-info'] as const,
  apps: (sourceId: string | null) => ['appstore', sourceId, 'apps'] as const,
  appDetail: (sourceId: string | null, appKey: string | null) =>
    ['appstore', sourceId, 'apps', appKey, 'detail'] as const,
} as const

export type QkKey =
  | ReturnType<typeof qk.servers>
  | ReturnType<typeof qk.containers>
  | ReturnType<typeof qk.containerInspect>
  | ReturnType<typeof qk.containerStats>
  | ReturnType<typeof qk.images>
  | ReturnType<typeof qk.imageInspect>
  | ReturnType<typeof qk.imageHistory>
  | ReturnType<typeof qk.networks>
  | ReturnType<typeof qk.networkInspect>
  | ReturnType<typeof qk.volumes>
  | ReturnType<typeof qk.volumeInspect>
  | ReturnType<typeof qk.dockerInfo>
  | ReturnType<typeof qk.serverConnection>
  | ReturnType<typeof qk.dockerAccess>
  | ReturnType<typeof qk.dockerDaemon>
  | ReturnType<typeof qk.portForwards>
  | ReturnType<typeof qk.knownHosts>
  | ReturnType<typeof qk.localAddresses>
  | ReturnType<typeof qk.appstoreSettings>
  | ReturnType<typeof qk.appstoreCacheInfo>
  | ReturnType<typeof qk.apps>
  | ReturnType<typeof qk.appDetail>
