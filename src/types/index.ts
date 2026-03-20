export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  password?: string;
  key_path?: string;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  created_at: string;
  running_for: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created_at: string;
  created_since: string;
}

export interface DockerInfo {
  containers: number;
  containers_running: number;
  containers_paused: number;
  containers_stopped: number;
  images: number;
  server_version: string;
  name: string;
  ncpu: number;
  mem_total: number;
  os: string;
  os_version: string;
  kernel_version: string;
  architecture: string;
  storage_driver: string;
  warnings: number;
}

export interface ContainerStats {
  cpu_percent: number;
  mem_usage: number;
  mem_limit: number;
  mem_percent: number;
  net_rx: number;
  net_tx: number;
  blk_read: number;
  blk_write: number;
}
