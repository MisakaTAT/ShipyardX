use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct ContainerSummary {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Names")]
    pub names: Vec<String>,
    #[serde(rename = "Image")]
    pub image: String,
    #[serde(rename = "ImageID", default)]
    pub image_id: String,
    #[serde(rename = "State")]
    pub state: String,
    #[serde(rename = "Status")]
    pub status: String,
    #[serde(rename = "Ports")]
    pub ports: Vec<PortBinding>,
    #[serde(rename = "Mounts", default)]
    pub mounts: Vec<ContainerMountSummary>,
    #[serde(rename = "Created")]
    pub created: i64,
    #[serde(rename = "NetworkSettings", default)]
    pub network_settings: ContainerNetworkSettings,
    #[serde(rename = "Labels", default)]
    pub labels: Option<HashMap<String, String>>,
}

#[derive(Deserialize, Default)]
pub struct ContainerMountSummary {
    #[serde(rename = "Type", default)]
    pub mount_type: String,
    #[serde(rename = "Name", default)]
    pub name: String,
}

#[derive(Deserialize, Default)]
pub struct ContainerNetworkSettings {
    #[serde(rename = "Networks", default)]
    pub networks: HashMap<String, ContainerNetworkEndpoint>,
}

#[derive(Deserialize, Default)]
pub struct ContainerNetworkEndpoint {
    #[serde(rename = "IPAddress", default)]
    pub ip_address: String,
}

#[derive(Deserialize)]
pub struct PortBinding {
    #[serde(rename = "IP")]
    pub ip: Option<String>,
    #[serde(rename = "PrivatePort")]
    pub private_port: u16,
    #[serde(rename = "PublicPort")]
    pub public_port: Option<u16>,
    #[serde(rename = "Type")]
    pub port_type: String,
}

#[derive(Deserialize)]
pub struct ContainerCreateResponse {
    #[serde(rename = "Id")]
    pub id: String,
}

#[derive(Serialize)]
pub struct ContainerCreate {
    #[serde(rename = "Image")]
    pub image: String,
    #[serde(rename = "Env", skip_serializing_if = "Vec::is_empty")]
    pub env: Vec<String>,
    #[serde(rename = "Cmd", skip_serializing_if = "Option::is_none")]
    pub cmd: Option<Vec<String>>,
    #[serde(rename = "Entrypoint", skip_serializing_if = "Option::is_none")]
    pub entrypoint: Option<Vec<String>>,
    #[serde(rename = "Tty")]
    pub tty: bool,
    #[serde(rename = "OpenStdin")]
    pub open_stdin: bool,
    #[serde(rename = "AttachStdin")]
    pub attach_stdin: bool,
    #[serde(rename = "AttachStdout")]
    pub attach_stdout: bool,
    #[serde(rename = "AttachStderr")]
    pub attach_stderr: bool,
    #[serde(rename = "Labels", skip_serializing_if = "HashMap::is_empty")]
    pub labels: HashMap<String, String>,
    #[serde(rename = "ExposedPorts", skip_serializing_if = "HashMap::is_empty")]
    pub exposed_ports: HashMap<String, serde_json::Value>,
    #[serde(rename = "HostConfig")]
    pub host_config: ContainerCreateHostConfig,
    #[serde(rename = "NetworkingConfig", skip_serializing_if = "Option::is_none")]
    pub networking_config: Option<ContainerNetworkingConfig>,
}

#[derive(Serialize)]
pub struct ContainerNetworkingConfig {
    #[serde(rename = "EndpointsConfig")]
    pub endpoints_config: HashMap<String, EndpointSettings>,
}

#[derive(Serialize)]
pub struct EndpointSettings {
    #[serde(rename = "IPAMConfig", skip_serializing_if = "Option::is_none")]
    pub ipam_config: Option<EndpointIpamConfig>,
}

#[derive(Serialize)]
pub struct EndpointIpamConfig {
    #[serde(rename = "IPv4Address", skip_serializing_if = "String::is_empty")]
    pub ipv4_address: String,
    #[serde(rename = "IPv6Address", skip_serializing_if = "String::is_empty")]
    pub ipv6_address: String,
}

#[derive(Serialize)]
pub struct ContainerCreateHostConfig {
    #[serde(rename = "PortBindings", skip_serializing_if = "HashMap::is_empty")]
    pub port_bindings: HashMap<String, Vec<ContainerCreatePortBinding>>,
    #[serde(rename = "PublishAllPorts", skip_serializing_if = "std::ops::Not::not")]
    pub publish_all_ports: bool,
    #[serde(rename = "Binds", skip_serializing_if = "Vec::is_empty")]
    pub binds: Vec<String>,
    #[serde(rename = "NetworkMode", skip_serializing_if = "String::is_empty")]
    pub network_mode: String,
    #[serde(rename = "RestartPolicy")]
    pub restart_policy: ContainerCreateRestartPolicy,
    #[serde(rename = "AutoRemove", skip_serializing_if = "std::ops::Not::not")]
    pub auto_remove: bool,
    #[serde(rename = "Privileged", skip_serializing_if = "std::ops::Not::not")]
    pub privileged: bool,
    #[serde(rename = "CpuShares", skip_serializing_if = "is_zero_i64")]
    pub cpu_shares: i64,
    #[serde(rename = "NanoCpus", skip_serializing_if = "is_zero_i64")]
    pub nano_cpus: i64,
    #[serde(rename = "Memory", skip_serializing_if = "is_zero_i64")]
    pub memory: i64,
}

fn is_zero_i64(v: &i64) -> bool {
    *v == 0
}

#[derive(Serialize)]
pub struct ContainerCreatePortBinding {
    #[serde(rename = "HostIp")]
    pub host_ip: String,
    #[serde(rename = "HostPort")]
    pub host_port: String,
}

#[derive(Serialize)]
pub struct ContainerCreateRestartPolicy {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "MaximumRetryCount")]
    pub maximum_retry_count: u32,
}
