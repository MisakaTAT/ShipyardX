import { invoke, type InvokeArgs } from '@tauri-apps/api/core'
import type {
  Container,
  ContainerStats,
  DaemonSettings,
  DaemonUpdate,
  Image,
  DockerEngineInfo,
  Network,
  Volume,
  LocalAddress,
  NetworkCreate,
  PortForward,
  PortForwardCreate,
  RunContainer,
  Server,
  TerminalSession,
  VolumeCreate,
} from '@/types'

export async function invokeContainerCommand(
  command: string,
  args: { serverId: string; containerId: string } & Record<string, unknown>,
): Promise<void> {
  return invoke(command, args as InvokeArgs)
}

export async function checkEngineAccess(args: { serverId: string }): Promise<void> {
  return invoke('check_docker_access', args)
}

export async function getEngineInfo(args: { serverId: string }): Promise<DockerEngineInfo> {
  return invoke<DockerEngineInfo>('get_docker_info', args)
}

export async function listContainers(args: { serverId: string }): Promise<Container[]> {
  return invoke<Container[]>('list_containers', args)
}

export async function runContainer(args: { serverId: string; params: RunContainer }): Promise<string> {
  return invoke<string>('run_container', {
    server_id: args.serverId,
    params: args.params,
  } as InvokeArgs)
}

export async function listImages(args: { serverId: string }): Promise<Image[]> {
  return invoke<Image[]>('list_images', args)
}

export async function removeImage(args: { serverId: string; imageId: string; force: boolean }): Promise<void> {
  return invoke('remove_image', args)
}

export async function cancelStream(args: { streamId: string }): Promise<void> {
  return invoke('cancel_stream', args)
}

export async function startImagePull(args: { serverId: string; image: string }): Promise<string> {
  return invoke<string>('start_image_pull', args)
}

export async function listNetworks(args: { serverId: string }): Promise<Network[]> {
  return invoke<Network[]>('list_networks', args)
}

export async function createNetwork(args: { serverId: string; params: NetworkCreate }): Promise<void> {
  return invoke('create_network', {
    server_id: args.serverId,
    params: args.params,
  } as InvokeArgs)
}

export async function removeNetwork(args: { serverId: string; networkId: string }): Promise<void> {
  return invoke('remove_network', args)
}

export async function listVolumes(args: { serverId: string }): Promise<Volume[]> {
  return invoke<Volume[]>('list_volumes', args)
}

export async function createVolume(args: { serverId: string } & VolumeCreate): Promise<void> {
  return invoke('create_volume', args as unknown as InvokeArgs)
}

export async function removeVolume(args: { serverId: string; name: string }): Promise<void> {
  return invoke('remove_volume', args)
}

export async function getDaemonSettings(args: { serverId: string }): Promise<DaemonSettings> {
  return invoke<DaemonSettings>('get_docker_daemon_settings', args)
}

export async function updateDaemonSettings(serverId: string, params: DaemonUpdate): Promise<void> {
  return invoke('update_docker_daemon_settings', {
    server_id: serverId,
    params,
  } as InvokeArgs)
}

export async function restartDaemon(args: { serverId: string; sudoPassword: string | null }): Promise<void> {
  return invoke('restart_docker_daemon', {
    server_id: args.serverId,
    sudo_password: args.sudoPassword,
  } as InvokeArgs)
}

export async function getServers(): Promise<Server[]> {
  return invoke<Server[]>('get_servers')
}

export async function deleteServer(args: { id: string }): Promise<Server[]> {
  return invoke<Server[]>('delete_server', args)
}

export async function addServer(args: { server: Server }): Promise<Server[]> {
  return invoke<Server[]>('add_server', args)
}

export async function updateServer(args: { server: Server }): Promise<Server[]> {
  return invoke<Server[]>('update_server', args)
}

export async function testConnectionDirect(args: { server: Server }): Promise<string> {
  return invoke<string>('test_connection_direct', args)
}

export async function closeTerminal(args: { sessionId: string }): Promise<void> {
  return invoke('close_terminal', args)
}

export async function openTerminal(args: { serverId: string; cols: number; rows: number }): Promise<TerminalSession> {
  return invoke<TerminalSession>('open_terminal', args)
}

export async function openContainerExecTerminal(args: {
  serverId: string
  containerId: string
  user: string | null
  shell: string
  cols: number
  rows: number
}): Promise<TerminalSession> {
  return invoke<TerminalSession>('open_container_exec_terminal', args)
}

export async function getContainerStats(args: { serverId: string; containerId: string }): Promise<ContainerStats> {
  return invoke<ContainerStats>('get_container_stats', args)
}

export async function stopLogStream(args: { streamId: string }): Promise<void> {
  return invoke('stop_log_stream', args)
}

export async function getContainerLogs(args: {
  serverId: string
  containerId: string
  tail: number
  timestamps: boolean
}): Promise<string> {
  return invoke<string>('get_container_logs', args)
}

export async function startLogStream(args: {
  serverId: string
  containerId: string
  tail: number
  timestamps: boolean
}): Promise<string> {
  return invoke<string>('start_log_stream', args)
}

export async function inspectContainer(args: { serverId: string; containerId: string }): Promise<string> {
  return invoke<string>('inspect_container', args)
}

export async function inspectImage(args: { serverId: string; imageId: string }): Promise<string> {
  return invoke<string>('inspect_image', args)
}

export async function inspectNetwork(args: { serverId: string; networkId: string }): Promise<string> {
  return invoke<string>('inspect_network', args)
}

export async function inspectVolume(args: { serverId: string; name: string }): Promise<string> {
  return invoke<string>('inspect_volume', args)
}

export async function startEventStream(args: { serverId: string }): Promise<string> {
  return invoke<string>('start_event_stream', args)
}

export async function stopEventStream(args: { serverId: string }): Promise<void> {
  return invoke('stop_event_stream', args)
}

export async function listPortForwardsAll(): Promise<PortForward[]> {
  return invoke<PortForward[]>('list_port_forwards_all')
}

export async function listLocalAddresses(): Promise<LocalAddress[]> {
  return invoke<LocalAddress[]>('list_local_addresses')
}

export async function createPortForwardRule(args: {
  serverId: string
  params: PortForwardCreate
}): Promise<PortForward> {
  return invoke<PortForward>('create_port_forward_rule', {
    server_id: args.serverId,
    params: args.params,
  } as InvokeArgs)
}

export async function startAllEnabledGlobal(): Promise<void> {
  return invoke('start_all_enabled_global')
}

export async function stopAllGlobal(): Promise<void> {
  return invoke('stop_all_global')
}

export async function setPortForwardEnabled(args: { id: string; enabled: boolean }): Promise<void> {
  return invoke('set_port_forward_enabled', args)
}

export async function deletePortForward(args: { id: string }): Promise<void> {
  return invoke('delete_port_forward', args)
}
