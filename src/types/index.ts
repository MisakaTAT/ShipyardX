export interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_type: 'password' | 'key'
  password?: string
  key_path?: string
}

export interface Container {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string
  created_ts: number
}

export interface DockerImage {
  id: string
  repository: string
  tag: string
  size: string
  created_ts: number
}

export interface DockerNetwork {
  id: string
  name: string
  driver: string
  scope: string
  created_at: string
  subnets: string[]
  gateways: string[]
  labels: string[]
  internal: boolean
  attachable: boolean
}

export interface CreateNetworkRequest {
  name: string
  driver?: string | null
  subnet?: string | null
  gateway?: string | null
  internal: boolean
  attachable: boolean
}

export interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
  scope: string
  created_at: string
}

export interface CreateVolumeRequest {
  name: string
  driver?: string | null
  driverOpts?: Record<string, string> | null
}

export interface DockerInfo {
  containers: number
  containers_running: number
  containers_paused: number
  containers_stopped: number
  images: number
  server_version: string
  api_version: string
  name: string
  ncpu: number
  mem_total: number
  os: string
  os_version: string
  kernel_version: string
  architecture: string
  storage_driver: string
  warnings: number
}

export interface DockerDaemonSettings {
  mirror_urls: string[]
  log_rotation: boolean
  log_max_size: string
  log_max_file: string
  live_restore: boolean
  cgroup_driver: string
  socket_path: string
}

export interface UpdateDockerDaemonRequest {
  mirrorUrls: string[]
  logRotation: boolean
  logMaxSize: string
  logMaxFile: string
  liveRestore: boolean
  cgroupDriver: string
  socketPath: string
}

export interface ContainerStats {
  cpu_percent: number
  mem_usage: number
  mem_limit: number
  mem_percent: number
  net_rx: number
  net_tx: number
  blk_read: number
  blk_write: number
}

export interface DockerEvent {
  event_type: string
  action: string
  actor_id: string
  actor_name: string
  actor_image: string
  scope: string
  time: number
  time_nano: number
  detail: string
}

export type EventStreamStatus = 'connecting' | 'connected' | 'disconnected' | 'stopped'
