use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created_ts: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_ts: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerNetwork {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub created_at: String,
    pub subnets: Vec<String>,
    pub gateways: Vec<String>,
    pub labels: Vec<String>,
    pub internal: bool,
    pub attachable: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerVolume {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub scope: String,
    pub created_at: String,
}
